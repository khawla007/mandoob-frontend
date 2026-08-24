\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('99000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'valid-content-admin@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now()),
  ('99000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'valid-content-pro@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now());

insert into public.profiles (id, role, status, full_name) values
  ('99000000-0000-4000-8000-000000000001', 'admin', 'active', 'Valid Content Operator'),
  ('99000000-0000-4000-8000-000000000002', 'pro', 'active', 'Valid Content PRO');
insert into public.pro_profiles (profile_id)
values ('99000000-0000-4000-8000-000000000002');

select public.create_pro_credential_draft(
  '99000000-0000-4000-8000-000000000002',
  '99000000-0000-4000-8000-000000000002',
  '99000000-0000-4000-8000-000000000011', repeat('1', 64)
);

do $$
declare
  v_credential_id uuid;
  v_result jsonb;
begin
  select id into strict v_credential_id
  from public.pro_credentials
  where pro_profile_id = '99000000-0000-4000-8000-000000000002';

  v_result := public.save_pro_credential_draft(
    '99000000-0000-4000-8000-000000000002', v_credential_id, 0,
    '99000000-0000-4000-8000-000000000012', repeat('2', 64), false,
    'valid-content-ciphertext', repeat('c', 64), 'A123',
    'https://authority.example', current_date, current_date + 365
  );
  if v_result ->> 'issuingAuthority' <> 'https://authority.example' then
    raise exception 'VALID_AUTHORITY_NOT_REPRESENTED';
  end if;

  perform public.register_pro_credential_evidence(
    '99000000-0000-4000-8000-000000000002', v_credential_id, 1,
    '99000000-0000-4000-8000-000000000013', repeat('3', 64),
    '99000000-0000-4000-8000-000000000014',
    'pro-credentials/99000000-0000-4000-8000-000000000002/' || v_credential_id::text ||
      '/99000000-0000-4000-8000-000000000014',
    'application/pdf', 8, repeat('d', 64), 'authority-proof.pdf', 'synthetic-scanner', now()
  );
  perform public.submit_pro_credential(
    '99000000-0000-4000-8000-000000000002', v_credential_id, 2,
    '99000000-0000-4000-8000-000000000015', repeat('4', 64)
  );
  perform public.begin_pro_credential_review(
    '99000000-0000-4000-8000-000000000001', v_credential_id, 3,
    '99000000-0000-4000-8000-000000000016', repeat('5', 64)
  );
  begin
    v_result := public.reject_pro_credential(
      '99000000-0000-4000-8000-000000000001', v_credential_id, 4,
      '99000000-0000-4000-8000-000000000019', repeat('9', 64),
      'NOT_VERIFIABLE', 'The identifier could not be verified'
    );
    if v_result ->> 'state' <> 'rejected' or not exists (
      select 1 from public.pro_credential_decisions
      where credential_id = v_credential_id
        and reason = 'The identifier could not be verified'
    ) then
      raise exception 'VALID_REJECT_REASON_NOT_REPRESENTED';
    end if;
    raise exception 'ROLLBACK_VALID_REJECT_PROBE';
  exception when others then
    if sqlerrm <> 'ROLLBACK_VALID_REJECT_PROBE' then raise; end if;
  end;
  perform public.verify_pro_credential(
    '99000000-0000-4000-8000-000000000001', v_credential_id, 4,
    '99000000-0000-4000-8000-000000000017', repeat('6', 64)
  );
  v_result := public.revoke_pro_credential(
    '99000000-0000-4000-8000-000000000001', v_credential_id, 5,
    '99000000-0000-4000-8000-000000000018', repeat('7', 64),
    'NOT_VERIFIABLE', 'The identifier could not be verified'
  );
  if v_result ->> 'state' <> 'revoked' then
    raise exception 'VALID_REASON_OPERATION_FAILED';
  end if;
  if not exists (
    select 1 from public.pro_credential_decisions
    where credential_id = v_credential_id
      and reason = 'The identifier could not be verified'
  ) then
    raise exception 'VALID_REASON_NOT_REPRESENTED';
  end if;
  if not exists (
    select 1 from public.pro_lifecycle_operation_receipts
    where sanitized_result ->> 'issuingAuthority' = 'https://authority.example'
  ) then
    raise exception 'VALID_AUTHORITY_RECEIPT_NOT_REPRESENTED';
  end if;
end;
$$;

rollback;
