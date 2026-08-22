\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('92000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'preserve-existing@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now()),
  ('92000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'preserve-missing@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now()),
  ('92000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'preserve-legacy@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now());

insert into public.profiles (id, role, status, full_name) values
  ('92000000-0000-4000-8000-000000000001', 'pro', 'active', 'Existing Identifier PRO'),
  ('92000000-0000-4000-8000-000000000002', 'pro', 'active', 'Missing Identifier PRO'),
  ('92000000-0000-4000-8000-000000000003', 'pro', 'active', 'Legacy Identifier PRO');
insert into public.pro_profiles (profile_id) values
  ('92000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002'),
  ('92000000-0000-4000-8000-000000000003');

select public.create_pro_credential_draft(
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000011', repeat('1', 64)
);
select public.create_pro_credential_draft(
  '92000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000012', repeat('2', 64)
);
insert into public.pro_credentials (
  pro_profile_id, identifier_ciphertext, legacy_unmasked, created_by
) values (
  '92000000-0000-4000-8000-000000000003', 'legacy-ciphertext', true,
  '92000000-0000-4000-8000-000000000003'
);

do $$
declare
  v_existing_id uuid;
  v_missing_id uuid;
  v_legacy_id uuid;
  v_ciphertext text;
  v_hash text;
  v_last4 text;
  v_preserved jsonb;
  v_replay jsonb;
begin
  select id into strict v_existing_id from public.pro_credentials
  where pro_profile_id = '92000000-0000-4000-8000-000000000001';
  select id into strict v_missing_id from public.pro_credentials
  where pro_profile_id = '92000000-0000-4000-8000-000000000002';
  select id into strict v_legacy_id from public.pro_credentials
  where pro_profile_id = '92000000-0000-4000-8000-000000000003';

  perform public.save_pro_credential_draft(
    '92000000-0000-4000-8000-000000000001', v_existing_id, 0,
    '92000000-0000-4000-8000-000000000021', repeat('3', 64), false,
    'protected-ciphertext', repeat('a', 64), 'AB12', 'Initial Authority',
    current_date, current_date + 365
  );
  select identifier_ciphertext, identifier_hash, identifier_last4
  into strict v_ciphertext, v_hash, v_last4
  from public.pro_credentials where id = v_existing_id;

  v_preserved := public.save_pro_credential_draft(
    p_actor_id => '92000000-0000-4000-8000-000000000001',
    p_credential_id => v_existing_id,
    p_expected_version => 1,
    p_operation_id => '92000000-0000-4000-8000-000000000022',
    p_payload_hash => repeat('4', 64),
    p_preserve_identifier => true,
    p_identifier_ciphertext => null,
    p_identifier_hash => null,
    p_identifier_last4 => null,
    p_issuing_authority => 'Updated Authority',
    p_issue_date => current_date,
    p_expiry_date => current_date + 730
  );
  if (v_preserved ->> 'version')::bigint <> 2 then
    raise exception 'PRESERVE_VERSION_NOT_INCREMENTED';
  end if;
  if exists (
    select 1 from public.pro_credentials
    where id = v_existing_id
      and (identifier_ciphertext is distinct from v_ciphertext
        or identifier_hash is distinct from v_hash
        or identifier_last4 is distinct from v_last4)
  ) then
    raise exception 'PRESERVED_IDENTIFIER_CHANGED';
  end if;

  v_replay := public.save_pro_credential_draft(
    '92000000-0000-4000-8000-000000000001', v_existing_id, 1,
    '92000000-0000-4000-8000-000000000022', repeat('4', 64), true,
    null, null, null, 'Updated Authority', current_date, current_date + 730
  );
  if v_replay <> v_preserved then raise exception 'IDENTICAL_REPLAY_CHANGED'; end if;

  begin
    perform public.save_pro_credential_draft(
      '92000000-0000-4000-8000-000000000001', v_existing_id, 1,
      '92000000-0000-4000-8000-000000000022', repeat('5', 64), true,
      null, null, null, 'Changed Replay', current_date, current_date + 730
    );
    raise exception 'EXPECTED_OPERATION_REUSED';
  exception when others then
    if sqlerrm <> 'OPERATION_REUSED' then raise; end if;
  end;

  begin
    perform public.save_pro_credential_draft(
      '92000000-0000-4000-8000-000000000001', v_existing_id, 1,
      '92000000-0000-4000-8000-000000000023', repeat('6', 64), true,
      null, null, null, 'Stale Authority', current_date, current_date + 730
    );
    raise exception 'EXPECTED_STALE_CREDENTIAL_VERSION';
  exception when others then
    if sqlerrm <> 'STALE_CREDENTIAL_VERSION' then raise; end if;
  end;

  begin
    perform public.save_pro_credential_draft(
      '92000000-0000-4000-8000-000000000002', v_missing_id, 0,
      '92000000-0000-4000-8000-000000000024', repeat('7', 64), true,
      null, null, null, 'Missing Authority', current_date, current_date + 365
    );
    raise exception 'EXPECTED_MISSING_IDENTIFIER_REJECTION';
  exception when others then
    if sqlerrm <> 'CREDENTIAL_IDENTIFIER_REQUIRED' then raise; end if;
  end;

  begin
    perform public.save_pro_credential_draft(
      '92000000-0000-4000-8000-000000000003', v_legacy_id, 0,
      '92000000-0000-4000-8000-000000000025', repeat('8', 64), true,
      null, null, null, 'Legacy Authority', current_date, current_date + 365
    );
    raise exception 'EXPECTED_LEGACY_IDENTIFIER_REJECTION';
  exception when others then
    if sqlerrm <> 'CREDENTIAL_IDENTIFIER_REQUIRED' then raise; end if;
  end;
end;
$$;

rollback;
