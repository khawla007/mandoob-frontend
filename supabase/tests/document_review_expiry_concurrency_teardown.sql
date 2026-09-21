\set ON_ERROR_STOP on
begin;

delete from public.tenant_audit_log
where tenant_id='99030772-0000-4000-8000-000000000100';
alter table public.document_versions disable trigger document_versions_immutable;
delete from public.document_versions
where tenant_id='99030772-0000-4000-8000-000000000100';
alter table public.document_versions enable trigger document_versions_immutable;
delete from public.documents
where tenant_id='99030772-0000-4000-8000-000000000100';
delete from public.pro_company_assignments
where tenant_id='99030772-0000-4000-8000-000000000100';
delete from public.company_profiles
where tenant_id='99030772-0000-4000-8000-000000000100';
delete from public.pro_profiles
where profile_id in (
  '99030772-0000-4000-8000-000000000001',
  '99030772-0000-4000-8000-000000000003'
);
delete from public.profiles where id in (
  '99030772-0000-4000-8000-000000000001',
  '99030772-0000-4000-8000-000000000003'
);
delete from public.tenants
where id='99030772-0000-4000-8000-000000000100';
delete from auth.users where id in (
  '99030772-0000-4000-8000-000000000001',
  '99030772-0000-4000-8000-000000000003'
);
drop schema if exists document_review_expiry_contract cascade;
commit;
