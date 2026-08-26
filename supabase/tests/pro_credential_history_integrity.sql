\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'history-' || state || '@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()
from (values
  ('92000000-0000-4000-8000-000000000001'::uuid, 'rejected'),
  ('92000000-0000-4000-8000-000000000002'::uuid, 'expired'),
  ('92000000-0000-4000-8000-000000000003'::uuid, 'revoked')
) fixture(id, state);

insert into public.profiles (id, role, status, full_name)
select id, 'pro', 'active', 'History ' || state
from (values
  ('92000000-0000-4000-8000-000000000001'::uuid, 'rejected'),
  ('92000000-0000-4000-8000-000000000002'::uuid, 'expired'),
  ('92000000-0000-4000-8000-000000000003'::uuid, 'revoked')
) fixture(id, state);
insert into public.pro_profiles (profile_id)
values
  ('92000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002'),
  ('92000000-0000-4000-8000-000000000003');

do $$
declare
  v_target uuid;
  v_state public.pro_credential_state;
  v_old_id uuid;
  v_replacement jsonb;
  v_index integer := 0;
begin
  for v_target, v_state in
    select * from (values
      ('92000000-0000-4000-8000-000000000001'::uuid, 'rejected'::public.pro_credential_state),
      ('92000000-0000-4000-8000-000000000002'::uuid, 'expired'::public.pro_credential_state),
      ('92000000-0000-4000-8000-000000000003'::uuid, 'revoked'::public.pro_credential_state)
    ) fixture(target, state)
  loop
    v_index := v_index + 1;
    insert into public.pro_credentials (
      pro_profile_id, state, submitted_at, created_by
    ) values (v_target, v_state, now(), v_target)
    returning id into v_old_id;

    begin
      perform public.create_pro_credential_draft(
        v_target, v_target,
        ('92000000-0000-4000-8000-' || pg_catalog.lpad((100 + v_index)::text, 12, '0'))::uuid,
        pg_catalog.repeat(v_index::text, 64)
      );
      raise exception 'EXPECTED_CREDENTIAL_HISTORY_EXISTS';
    exception when others then
      if sqlerrm <> 'CREDENTIAL_HISTORY_EXISTS' then raise; end if;
    end;

    v_replacement := public.create_pro_credential_replacement(
      v_target, v_old_id, 0,
      ('92000000-0000-4000-8000-' || pg_catalog.lpad((200 + v_index)::text, 12, '0'))::uuid,
      pg_catalog.repeat((v_index + 3)::text, 64)
    );
    if v_replacement ->> 'supersedesCredentialId' <> v_old_id::text
      or not exists (
        select 1 from public.pro_credentials
        where id = (v_replacement ->> 'credentialId')::uuid
          and supersedes_credential_id = v_old_id
      )
    then
      raise exception 'INVALID_SUPERSEDED_CHAIN';
    end if;
  end loop;
end;
$$;

rollback;
