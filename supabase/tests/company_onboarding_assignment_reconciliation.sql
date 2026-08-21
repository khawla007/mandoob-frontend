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
insert into public.pro_profiles (
  profile_id, credentials_verified, verified_at, verified_by_profile_id
) values
  ('93000000-0000-4000-8000-000000000011', true, pg_catalog.now(), '93000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000012', true, pg_catalog.now(), '93000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000013', true, pg_catalog.now(), '93000000-0000-4000-8000-000000000001');

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
declare v_onboarding_status text; v_operational_status text; v_forbidden_grants integer;
begin
  select status into v_onboarding_status from public.tenants
  where id = '93000000-0000-4000-8000-000000000021';
  select status into v_operational_status from public.tenants
  where id = '93000000-0000-4000-8000-000000000022';
  if v_onboarding_status <> 'pending' or v_operational_status <> 'active' then
    raise exception 'tenant state mismatch: onboarding %, operational %',
      v_onboarding_status, v_operational_status;
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
