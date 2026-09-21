\set ON_ERROR_STOP on
begin;
delete from public.document_request_batch_operations
where operation_id='99030771-0000-4000-8000-000000000900';
delete from public.document_requests
where tenant_id='99030771-0000-4000-8000-000000000100';
delete from public.tenant_audit_log
where tenant_id='99030771-0000-4000-8000-000000000100';
delete from public.pro_company_assignments
where company_id='99030771-0000-4000-8000-000000000101';
delete from public.company_profiles
where id='99030771-0000-4000-8000-000000000101';
delete from public.tenants
where id='99030771-0000-4000-8000-000000000100';
delete from public.pro_profiles
where profile_id='99030771-0000-4000-8000-000000000002';
delete from public.profiles
where id in (
  '99030771-0000-4000-8000-000000000001',
  '99030771-0000-4000-8000-000000000002'
);
delete from auth.users
where id in (
  '99030771-0000-4000-8000-000000000001',
  '99030771-0000-4000-8000-000000000002'
);
commit;
select 'BATCH_ASSIGNMENT_CONTENTION_CLEAN';
