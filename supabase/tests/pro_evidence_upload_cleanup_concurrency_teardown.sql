\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;
set local session_replication_role = replica;
delete from public.pro_lifecycle_operation_receipts
where entity_id = '95100000-0000-4000-8000-000000000010';
delete from public.auth_events
where actor_user_id = '95100000-0000-4000-8000-000000000001';
delete from public.pro_credential_evidence where pro_profile_id = '95100000-0000-4000-8000-000000000001';
do $$ declare v_id uuid; begin
  for v_id in select id from public.pro_credential_evidence_upload_reservations
    where pro_profile_id = '95100000-0000-4000-8000-000000000001'
  loop
    perform pg_catalog.set_config('app.pro_evidence_upload_retention', v_id::text, true);
    delete from public.pro_credential_evidence_upload_reservations where id = v_id;
  end loop;
end $$;
delete from public.pro_credentials where pro_profile_id = '95100000-0000-4000-8000-000000000001';
delete from public.pro_profiles where profile_id = '95100000-0000-4000-8000-000000000001';
delete from public.profiles where id = '95100000-0000-4000-8000-000000000001';
delete from auth.users where id = '95100000-0000-4000-8000-000000000001';
commit;
