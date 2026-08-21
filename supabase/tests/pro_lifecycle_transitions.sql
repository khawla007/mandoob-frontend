\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'step3-admin@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now()),
  ('91000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'step3-pro@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now());

insert into public.profiles (id, role, status, full_name) values
  ('91000000-0000-4000-8000-000000000001', 'admin', 'active', 'Synthetic Operator'),
  ('91000000-0000-4000-8000-000000000002', 'pro', 'active', 'Synthetic PRO');
insert into public.pro_profiles (profile_id)
values ('91000000-0000-4000-8000-000000000002');

select public.create_pro_credential_draft(
  '91000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000011',
  repeat('1', 64)
);

do $$
declare
  v_credential_id uuid;
  v_result jsonb;
  v_pricing_id uuid;
  v_compensation_id uuid;
begin
  select id into strict v_credential_id
  from public.pro_credentials
  where pro_profile_id = '91000000-0000-4000-8000-000000000002';

  perform public.save_pro_credential_draft(
    '91000000-0000-4000-8000-000000000002', v_credential_id, 0,
    '91000000-0000-4000-8000-000000000012', repeat('2', 64),
    'synthetic-ciphertext', repeat('a', 64), 'AB12', 'Synthetic Authority',
    current_date, current_date + 365
  );
  perform public.register_pro_credential_evidence(
    '91000000-0000-4000-8000-000000000002', v_credential_id, 1,
    '91000000-0000-4000-8000-000000000013', repeat('3', 64),
    '91000000-0000-4000-8000-000000000014',
    'pro-credentials/91000000-0000-4000-8000-000000000002/' || v_credential_id::text ||
      '/91000000-0000-4000-8000-000000000014',
    'application/pdf', 8, repeat('b', 64), 'evidence.pdf', 'synthetic-scanner', now()
  );
  perform public.submit_pro_credential(
    '91000000-0000-4000-8000-000000000002', v_credential_id, 2,
    '91000000-0000-4000-8000-000000000015', repeat('4', 64)
  );
  perform public.begin_pro_credential_review(
    '91000000-0000-4000-8000-000000000001', v_credential_id, 3,
    '91000000-0000-4000-8000-000000000016', repeat('5', 64)
  );
  begin
    perform public.reject_pro_credential(
      '91000000-0000-4000-8000-000000000001', v_credential_id, 4,
      '91000000-0000-4000-8000-000000000018', repeat('8', 64),
      'UNSAFE_REASON',
      'Raw storage path pro-credentials/91000000-0000-4000-8000-000000000002/evidence.pdf'
    );
    raise exception 'EXPECTED_INVALID_DECISION_REASON';
  exception when others then
    if sqlerrm <> 'INVALID_DECISION_REASON' then raise; end if;
  end;
  v_result := public.verify_pro_credential(
    '91000000-0000-4000-8000-000000000001', v_credential_id, 4,
    '91000000-0000-4000-8000-000000000017', repeat('6', 64)
  );
  if v_result ->> 'state' <> 'verified' or v_result ? 'identifierHash'
     or v_result ? 'storagePath' then
    raise exception 'UNSAFE_OR_INVALID_CREDENTIAL_RESULT';
  end if;
  if not public.has_current_pro_credential('91000000-0000-4000-8000-000000000002') then
    raise exception 'VERIFIED_CREDENTIAL_NOT_CURRENT';
  end if;
  update public.pro_credentials
  set issue_date = current_date - 365, expiry_date = current_date - 1
  where id = v_credential_id;
  if public.has_current_pro_credential('91000000-0000-4000-8000-000000000002') then
    raise exception 'DATE_EXPIRED_CREDENTIAL_HAS_ACCESS';
  end if;
  update public.pro_credentials
  set issue_date = current_date, expiry_date = current_date + 365
  where id = v_credential_id;
  if public.verify_pro_credential(
    '91000000-0000-4000-8000-000000000001', v_credential_id, 4,
    '91000000-0000-4000-8000-000000000017', repeat('6', 64)
  ) <> v_result then
    raise exception 'CREDENTIAL_REPLAY_CHANGED';
  end if;
  begin
    perform public.verify_pro_credential(
      '91000000-0000-4000-8000-000000000001', v_credential_id, 4,
      '91000000-0000-4000-8000-000000000017', repeat('7', 64)
    );
    raise exception 'EXPECTED_OPERATION_REUSED';
  exception when others then
    if sqlerrm <> 'OPERATION_REUSED' then raise; end if;
  end;

  perform public.create_pro_commercial_term_draft(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000021', repeat('8', 64),
    'pricing', 'per_registration', 12500, null, current_date, null
  );
  select id into strict v_pricing_id from public.pro_commercial_terms
  where pro_profile_id = '91000000-0000-4000-8000-000000000002'
    and term_kind = 'pricing';
  perform public.activate_pro_commercial_term(
    '91000000-0000-4000-8000-000000000001', v_pricing_id, 1,
    '91000000-0000-4000-8000-000000000022', repeat('9', 64)
  );
  perform public.create_pro_commercial_term_draft(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000023', repeat('a', 64),
    'compensation', 'retainer', 500000, 'monthly', current_date, null
  );
  select id into strict v_compensation_id from public.pro_commercial_terms
  where pro_profile_id = '91000000-0000-4000-8000-000000000002'
    and term_kind = 'compensation';
  perform public.activate_pro_commercial_term(
    '91000000-0000-4000-8000-000000000001', v_compensation_id, 1,
    '91000000-0000-4000-8000-000000000024', repeat('b', 64)
  );
  v_result := public.evaluate_pro_assignment_eligibility(
    '91000000-0000-4000-8000-000000000002', null
  );
  if (v_result ->> 'eligible')::boolean is not true or v_result -> 'codes' <> '[]'::jsonb then
    raise exception 'EXPECTED_ELIGIBLE_RESULT';
  end if;
  v_result := public.read_pro_lifecycle_timeline(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002', 25, null, null
  );
  if jsonb_array_length(v_result -> 'items') < 3
     or v_result::text ~ '(identifier_hash|storage_path|synthetic-ciphertext)' then
    raise exception 'UNSAFE_OR_EMPTY_TIMELINE';
  end if;
  perform public.revoke_pro_credential(
    '91000000-0000-4000-8000-000000000001', v_credential_id, 5,
    '91000000-0000-4000-8000-000000000025', repeat('c', 64),
    'OPERATOR_REVOKED', 'Evidence no longer current'
  );
  if public.has_current_pro_credential('91000000-0000-4000-8000-000000000002') then
    raise exception 'REVOKED_CREDENTIAL_HAS_ACCESS';
  end if;
  v_result := public.create_pro_credential_replacement(
    '91000000-0000-4000-8000-000000000002', v_credential_id, 6,
    '91000000-0000-4000-8000-000000000026', repeat('d', 64)
  );
  if v_result ->> 'state' <> 'draft' or v_result ->> 'supersedesCredentialId' <> v_credential_id::text then
    raise exception 'INVALID_REPLACEMENT_RESULT';
  end if;
  if not exists (
    select 1 from public.auth_events
    where kind = 'pro_lifecycle_changed'
      and actor_user_id = '91000000-0000-4000-8000-000000000001'
  ) or exists (
    select 1 from public.auth_events
    where kind = 'pro_lifecycle_changed'
      and details::text ~* '(synthetic-ciphertext|identifier_hash|storage_path|pro-credentials/)'
  ) then
    raise exception 'MISSING_OR_UNSAFE_LIFECYCLE_AUDIT';
  end if;
end;
$$;

rollback;
