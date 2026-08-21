\set ON_ERROR_STOP on
set statement_timeout = '10s';
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '92000000-0000-4000-8000-000000000010',
  'authenticated', 'authenticated', 'step2-operator@example.test', '', pg_catalog.now(),
  '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
);
insert into public.profiles (id, role, status, full_name)
values ('92000000-0000-4000-8000-000000000010', 'super_admin', 'active', 'Step 2 Operator');

insert into public.tenants (id, name, slug, plan, status)
values ('92000000-0000-4000-8000-000000000001', 'Readiness Fixture',
  'readiness-fixture', 'starter', 'pending');
insert into public.company_profiles (id, tenant_id, company_name, status)
values ('92000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000001', 'Readiness Fixture LLC', 'onboarding');

do $$
declare v_codes text[];
begin
  select pg_catalog.array_agg(code order by code) into v_codes
  from public.evaluate_company_activation_readiness('92000000-0000-4000-8000-000000000002');
  if not ('LEGAL_SECTION_INCOMPLETE' = any(v_codes))
     or not ('ACTIVE_VERIFIED_PRO_ASSIGNMENT_MISSING' = any(v_codes))
     or not ('TENANT_NOT_ACTIVATABLE' <> all(v_codes)) then
    raise exception 'unexpected readiness codes: %', v_codes;
  end if;
end;
$$;

select public.save_company_legal_section(
  '92000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002',
  0,
  '92000000-0000-4000-8000-000000000020',
  repeat('a', 64),
  jsonb_build_object(
    'complete_section', true,
    'company_name', 'Readiness Fixture LLC',
    'display_name', 'Readiness Fixture',
    'jurisdiction_type', 'mainland',
    'licensing_authority', 'Dubai Economy',
    'legal_structure', 'limited_liability_company',
    'trade_license_no', 'DED-9200',
    'license_expiry', '2030-12-31'
  )
);

-- A committed operation replays its exact sanitized result without another write.
select public.save_company_legal_section(
  '92000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002',
  0,
  '92000000-0000-4000-8000-000000000020',
  repeat('a', 64),
  '{}'::jsonb
);

do $$
begin
  perform public.save_company_legal_section(
    '92000000-0000-4000-8000-000000000010',
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002',
    0,
    '92000000-0000-4000-8000-000000000021',
    repeat('b', 64),
    '{}'::jsonb
  );
  raise exception 'expected stale version rejection';
exception
  when others then
    if sqlerrm <> 'STALE_ONBOARDING_VERSION' then raise; end if;
end;
$$;

do $$
declare v_version bigint; v_operations integer; v_audits integer;
begin
  select onboarding_version into v_version from public.company_profiles
  where id = '92000000-0000-4000-8000-000000000002';
  select count(*) into v_operations from public.company_onboarding_operations
  where company_id = '92000000-0000-4000-8000-000000000002';
  select count(*) into v_audits from public.tenant_audit_log
  where details ->> 'company_id' = '92000000-0000-4000-8000-000000000002'
    and action = 'company_onboarding_section_completed';
  if v_version <> 1 or v_operations <> 1 or v_audits <> 1 then
    raise exception 'idempotency mismatch: version %, operations %, audits %',
      v_version, v_operations, v_audits;
  end if;
end;
$$;

insert into public.company_shareholders (
  id, tenant_id, company_id, kind, full_name, nationality_code, ownership_percent, sort_order
) values
  ('92000000-0000-4000-8000-000000000032', '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002', 'individual', 'Second Owner', 'AE', 40, 1),
  ('92000000-0000-4000-8000-000000000031', '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002', 'individual', 'First Owner', 'AE', 60, 0);

insert into public.company_registered_activities (
  id, tenant_id, company_id, activity_code, activity_name, authority_name, is_primary, sort_order
) values
  ('92000000-0000-4000-8000-000000000042', '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002', 'SECOND', 'Second activity', 'Dubai Economy', false, 1),
  ('92000000-0000-4000-8000-000000000041', '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002', 'FIRST', 'First activity', 'Dubai Economy', true, 0);

insert into public.company_office_details (
  tenant_id, company_id, office_type, provider_name, city, emirate
) values (
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002',
  'virtual', 'Fixture Offices', 'Dubai', 'Dubai'
);

insert into public.company_bank_details (
  tenant_id, company_id, bank_name, account_holder_name, currency_code, swift_bic,
  iban_encrypted, iban_hash, iban_last4
) values (
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002',
  'Fixture Bank', 'Readiness Fixture LLC', 'AED', 'ABCDEFGH',
  'aggregate-iban-ciphertext', repeat('c', 64), '4321'
);

do $$
declare v_snapshot jsonb;
begin
  v_snapshot := public.read_company_onboarding(
    '92000000-0000-4000-8000-000000000010',
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002'
  );
  if pg_catalog.jsonb_array_length(v_snapshot -> 'sections') <> 6
     or v_snapshot #>> '{shareholders,0,full_name}' <> 'First Owner'
     or v_snapshot #>> '{activities,0,activity_code}' <> 'FIRST'
     or v_snapshot #>> '{bank,swift_bic_masked}' <> '•••• EFGH'
     or v_snapshot #>> '{bank,iban_masked}' <> '•••• 4321'
     or pg_catalog.strpos(v_snapshot::text, 'aggregate-iban-ciphertext') <> 0
     or pg_catalog.strpos(v_snapshot::text, repeat('c', 64)) <> 0 then
    raise exception 'unsafe or malformed aggregate snapshot: %', v_snapshot;
  end if;
end;
$$;

rollback;
