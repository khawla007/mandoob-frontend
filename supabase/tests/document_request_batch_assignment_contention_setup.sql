\set ON_ERROR_STOP on
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('99030771-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
    'authenticated','authenticated','batch-contention-admin@example.invalid','',now(),'{}','{}',now(),now()),
  ('99030771-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
    'authenticated','authenticated','batch-contention-pro@example.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,tenant_id,role,status) values
  ('99030771-0000-4000-8000-000000000001',null,'admin','active'),
  ('99030771-0000-4000-8000-000000000002',null,'pro','active');
insert into public.pro_profiles(profile_id) values
  ('99030771-0000-4000-8000-000000000002');
insert into public.tenants(id,slug,name,status) values
  ('99030771-0000-4000-8000-000000000100','batch-contention','Batch contention','active');
insert into public.company_profiles(id,tenant_id,company_name) values
  ('99030771-0000-4000-8000-000000000101',
   '99030771-0000-4000-8000-000000000100','Batch contention');
insert into public.pro_company_assignments(
  id,tenant_id,company_id,pro_profile_id,assigned_by
) values (
  '99030771-0000-4000-8000-000000000110',
  '99030771-0000-4000-8000-000000000100',
  '99030771-0000-4000-8000-000000000101',
  '99030771-0000-4000-8000-000000000002',
  '99030771-0000-4000-8000-000000000001'
);
commit;
select 'BATCH_ASSIGNMENT_CONTENTION_READY';
