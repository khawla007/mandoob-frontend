\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '91861000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'mfa-reservation@example.invalid', 'synthetic', now(),
  '{}', '{}', now(), now()
);

do $$
declare
  v_user_id constant uuid := '91861000-0000-4000-8000-000000000001';
  v_first constant uuid := '91861000-0000-4000-8000-000000000002';
  v_second constant uuid := '91861000-0000-4000-8000-000000000003';
begin
  if public.reserve_mfa_factor_removal(v_user_id, 'factor-a', v_first) is not true then
    raise exception 'FIRST_MFA_RESERVATION_REJECTED';
  end if;
  if public.reserve_mfa_factor_removal(v_user_id, 'factor-b', v_second) is not false then
    raise exception 'CONCURRENT_MFA_RESERVATION_ACCEPTED';
  end if;
  if public.release_mfa_factor_removal(v_user_id, 'factor-a', v_second) is not false then
    raise exception 'FOREIGN_MFA_RELEASE_ACCEPTED';
  end if;
  if public.release_mfa_factor_removal(v_user_id, 'factor-a', v_first) is not true then
    raise exception 'MFA_RESERVATION_NOT_RELEASED';
  end if;
  if public.reserve_mfa_factor_removal(v_user_id, 'factor-b', v_second) is not true then
    raise exception 'MFA_RESERVATION_NOT_RELEASED';
  end if;
end;
$$;

rollback;
