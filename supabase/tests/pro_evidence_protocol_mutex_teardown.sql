\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;
set local session_replication_role = replica;
delete from public.pro_credential_evidence_upload_reservations
where pro_profile_id in ('95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000002');
delete from public.pro_credential_evidence_removals
where pro_profile_id in ('95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000002');
delete from public.pro_credential_evidence
where pro_profile_id in ('95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000002');
delete from public.pro_credentials
where pro_profile_id in ('95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000002');
delete from public.pro_profiles where profile_id in ('95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000002');
delete from public.profiles where id in ('95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000002');
delete from auth.users where id in ('95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000002');
commit;
