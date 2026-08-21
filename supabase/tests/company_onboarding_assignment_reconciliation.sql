\set ON_ERROR_STOP on
set statement_timeout = '10s';
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from (values
  ('93000000-0000-4000-8000-000000000001'::uuid, 'step2-owner@example.test'),
  ('93000000-0000-4000-8000-000000000011'::uuid, 'step2-pro1@example.test'),
  ('93000000-0000-4000-8000-000000000012'::uuid, 'step2-pro2@example.test'),
  ('93000000-0000-4000-8000-000000000013'::uuid, 'step2-pro3@example.test')
) users(id, email);

insert into public.profiles (id, role, status, full_name) values
  ('93000000-0000-4000-8000-000000000001', 'super_admin', 'active', 'Step 2 Owner'),
  ('93000000-0000-4000-8000-000000000011', 'pro', 'active', 'Step 2 PRO 1'),
  ('93000000-0000-4000-8000-000000000012', 'pro', 'active', 'Step 2 PRO 2'),
  ('93000000-0000-4000-8000-000000000013', 'pro', 'active', 'Step 2 PRO 3');
insert into public.pro_profiles (profile_id) values
  ('93000000-0000-4000-8000-000000000011'),
  ('93000000-0000-4000-8000-000000000012'),
  ('93000000-0000-4000-8000-000000000013');
insert into public.pro_credentials (
  id, pro_profile_id, identifier_ciphertext, identifier_hash, identifier_last4,
  issuing_authority, issue_date, expiry_date, state, version, submitted_at, created_by
) select
  credential_id, pro_id, 'synthetic', pg_catalog.repeat(hash_character, 64), last_four,
  'Synthetic Authority', current_date - 30, current_date + 365,
  'verified', 5, pg_catalog.now(), '93000000-0000-4000-8000-000000000001'
from (values
  ('93000000-0000-4000-8000-000000000041'::uuid, '93000000-0000-4000-8000-000000000011'::uuid, 'a', 'AA11'),
  ('93000000-0000-4000-8000-000000000042'::uuid, '93000000-0000-4000-8000-000000000012'::uuid, 'b', 'BB22'),
  ('93000000-0000-4000-8000-000000000043'::uuid, '93000000-0000-4000-8000-000000000013'::uuid, 'c', 'CC33')
) credentials(credential_id, pro_id, hash_character, last_four);
insert into public.pro_commercial_terms (
  id, pro_profile_id, term_kind, model, amount_minor, effective_from,
  status, version, created_by
) select
  term_id, pro_id, term_kind::public.pro_term_kind, 'per_registration', 10000,
  current_date - 1, 'active', 1, '93000000-0000-4000-8000-000000000001'
from (values
  ('93000000-0000-4000-8000-000000000051'::uuid, '93000000-0000-4000-8000-000000000011'::uuid, 'pricing'),
  ('93000000-0000-4000-8000-000000000052'::uuid, '93000000-0000-4000-8000-000000000011'::uuid, 'compensation'),
  ('93000000-0000-4000-8000-000000000053'::uuid, '93000000-0000-4000-8000-000000000012'::uuid, 'pricing'),
  ('93000000-0000-4000-8000-000000000054'::uuid, '93000000-0000-4000-8000-000000000012'::uuid, 'compensation'),
  ('93000000-0000-4000-8000-000000000055'::uuid, '93000000-0000-4000-8000-000000000013'::uuid, 'pricing'),
  ('93000000-0000-4000-8000-000000000056'::uuid, '93000000-0000-4000-8000-000000000013'::uuid, 'compensation')
) terms(term_id, pro_id, term_kind);

insert into public.tenants (id, name, slug, plan, status) values
  ('93000000-0000-4000-8000-000000000021', 'Onboarding Assignment', 'onboarding-assignment', 'starter', 'pending'),
  ('93000000-0000-4000-8000-000000000022', 'Operational Assignment', 'operational-assignment', 'starter', 'pending');
insert into public.company_profiles (id, tenant_id, company_name, status) values
  ('93000000-0000-4000-8000-000000000031', '93000000-0000-4000-8000-000000000021', 'Onboarding Assignment LLC', 'onboarding'),
  ('93000000-0000-4000-8000-000000000032', '93000000-0000-4000-8000-000000000022', 'Operational Assignment LLC', 'active');

select public.assign_pro_to_company(
  '93000000-0000-4000-8000-000000000031',
  '93000000-0000-4000-8000-000000000011',
  '93000000-0000-4000-8000-000000000001'
) as onboarding_assignment_id \gset

select public.reassign_company_pro(
  '93000000-0000-4000-8000-000000000031',
  :'onboarding_assignment_id',
  '93000000-0000-4000-8000-000000000012',
  'Coverage change',
  '93000000-0000-4000-8000-000000000001'
);

select public.assign_pro_to_company(
  '93000000-0000-4000-8000-000000000032',
  '93000000-0000-4000-8000-000000000013',
  '93000000-0000-4000-8000-000000000001'
) as operational_assignment_id \gset

select public.reassign_company_pro(
  '93000000-0000-4000-8000-000000000032',
  :'operational_assignment_id',
  '93000000-0000-4000-8000-000000000011',
  'Operational coverage change',
  '93000000-0000-4000-8000-000000000001'
);

do $$
declare
  v_onboarding_status text;
  v_operational_status text;
  v_forbidden_grants integer;
  v_term_link_count integer;
begin
  select status into v_onboarding_status from public.tenants
  where id = '93000000-0000-4000-8000-000000000021';
  select status into v_operational_status from public.tenants
  where id = '93000000-0000-4000-8000-000000000022';
  if v_onboarding_status <> 'pending' or v_operational_status <> 'active' then
    raise exception 'tenant state mismatch: onboarding %, operational %',
      v_onboarding_status, v_operational_status;
  end if;
  select pg_catalog.count(*) into v_term_link_count
  from public.pro_assignment_term_links link
  join public.pro_company_assignments assignment on assignment.id = link.assignment_id
  where assignment.company_id in (
    '93000000-0000-4000-8000-000000000031',
    '93000000-0000-4000-8000-000000000032'
  );
  if v_term_link_count <> 4 then
    raise exception 'assignment term link mismatch: %', v_term_link_count;
  end if;

  select count(*) into v_forbidden_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('PUBLIC', 'anon', 'authenticated')
    and (
      table_name in ('company_bank_details', 'company_onboarding_operations')
      or (table_name = 'company_profiles' and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))
      or (
        table_name in (
          'company_shareholders', 'company_registered_activities',
          'company_office_details', 'company_onboarding_sections'
        ) and privilege_type <> 'SELECT'
      )
    );
  if v_forbidden_grants <> 0 then
    raise exception 'forbidden onboarding grants: %', v_forbidden_grants;
  end if;
end;
$$;

rollback;
