\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;
-- SQL metadata simulation only; actual blob deletion/rollback and physical orphan
-- proof remain an open provider gap for Task5 real Storage SDK tests.
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('99030740-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create temporary table cleanup_assertion_stats(assertions integer not null);
insert into cleanup_assertion_stats values(0);
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$
begin
  update cleanup_assertion_stats set assertions=assertions+1;
  if ok is distinct from true then raise exception '%',label; end if;
end;
$$;
create function pg_temp.reject(sql text,code text,label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlstate=code then
      update cleanup_assertion_stats set assertions=assertions+1; return;
    end if;
    raise exception 'UNEXPECTED_REJECTION_%',label;
  end;
  raise exception 'REJECTION_MISSING_%',label;
end; $$;
insert into public.tenants(id,slug,name) values(pg_temp.uid(100),'cleanup-contract','Synthetic');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,
  email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.uid(1),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'cleanup-contract@example.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,role,status) values(pg_temp.uid(1),'super_admin','active');
insert into public.company_profiles(id,tenant_id,company_name)
values(pg_temp.uid(101),pg_temp.uid(100),'Synthetic');
insert into storage.buckets(id,name,public) values('tenant-documents','tenant-documents',false)
on conflict(id) do nothing;
create function pg_temp.prepare(op integer) returns jsonb language sql as $$
select public.prepare_document_upload(pg_temp.uid(1),pg_temp.uid(100),pg_temp.uid(101),
 pg_temp.uid(op),null,null,null,'other',null,
 (select current_version_id from public.documents where tenant_id=pg_temp.uid(100) and company_id=pg_temp.uid(101)
   and request_id is null and employee_id is null and doc_type='other'),
 repeat('a',64),'application/pdf',8,'pdf','synthetic.pdf');
$$;
create function pg_temp.object(op integer) returns void language sql as $$
insert into storage.objects(bucket_id,name,metadata)
select 'tenant-documents',storage_path,jsonb_build_object('size',size_bytes,'mimetype',mime_type)
from public.document_upload_operations where operation_id=pg_temp.uid(op);
$$;
create function pg_temp.finish(op integer) returns jsonb language sql as $$
select public.finalize_document_upload(actor_id,tenant_id,company_id,operation_id,
 'clean','clamav',coalesce(scan_completed_at,clock_timestamp()),storage_path,mime_type,size_bytes,sha256)
from public.document_upload_operations where operation_id=pg_temp.uid(op);
$$;
create function pg_temp.claim(op integer,lease integer default 300) returns jsonb language sql as $$
select public.claim_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(op),lease);
$$;
create function pg_temp.authorize(op integer,fence uuid) returns jsonb language sql as $$
select public.authorize_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(op),fence);
$$;
create function pg_temp.complete(op integer,fence uuid,deleted boolean) returns jsonb language sql as $$
select public.complete_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(op),fence,deleted);
$$;
create function pg_temp.hold(op integer,held boolean) returns jsonb language sql as $$
select public.set_document_upload_cleanup_hold(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(op),held);
$$;
do $$ declare first jsonb; replay jsonb; f uuid; saved_path text; begin
  perform pg_temp.prepare(1000); perform pg_temp.object(1000);
  first:=pg_temp.claim(1000); f:=(first->>'fence')::uuid;
  perform pg_temp.check(first->>'status'='cleanup_pending' and f is not null,'CLAIM_PERMANENTLY_PENDING');
  replay:=pg_temp.claim(1000);
  perform pg_temp.check(first=replay,'CLAIM_REPLAY_STABLE');
  perform pg_temp.check((first->>'leaseUntil')::timestamptz <= clock_timestamp()+interval '300 seconds','LEASE_BOUNDED');
  saved_path:=first->>'storagePath';
  perform pg_temp.reject('select pg_temp.finish(1000)','DU409','CLAIM_BLOCKS_FINALIZE');
  perform pg_temp.reject('select pg_temp.authorize(1000,pg_temp.uid(99))','DU409','STALE_FENCE_AUTHORIZE');
  perform pg_temp.reject('select pg_temp.complete(1000,pg_temp.uid(99),true)','DU409','STALE_FENCE_COMPLETE');
  perform pg_temp.authorize(1000,f);
  perform pg_temp.reject('select pg_temp.hold(1000,true)','DU409','LATE_HOLD');
  perform pg_temp.reject(format('select pg_temp.complete(1000,%L,true)',f),'DU409','OBJECT_PRESENT_COMPLETE');
  perform pg_temp.complete(1000,f,false);
  perform pg_temp.check((select state='cleanup_pending' and storage_path=saved_path
    from public.document_upload_operations where operation_id=pg_temp.uid(1000)),'FAILURE_DURABLE_PENDING');
  perform pg_temp.reject('select pg_temp.object(1000)','DU409','LATE_OBJECT_WRITER');
  perform pg_temp.reject(format('update storage.objects set metadata=''{}'' where name=%L',saved_path),'DU409','CLAIMED_OBJECT_UPDATE');
  -- Harmless provider bookkeeping remains legal even for a fenced object.
  update storage.objects set last_accessed_at=clock_timestamp() where name=saved_path;
  -- Synthetic metadata only: bracket the existing Storage test permission.
  -- No provider blob is deleted or certified absent by this simulation.
  perform pg_catalog.set_config('storage.allow_delete_query','true',true);
  delete from storage.objects where bucket_id='tenant-documents' and name=saved_path;
  perform pg_catalog.set_config('storage.allow_delete_query','false',true);
  perform pg_temp.complete(1000,f,true);
  perform pg_temp.check((select state='cleaned' from public.document_upload_operations
    where operation_id=pg_temp.uid(1000)),'EXACT_ABSENT_OBJECT_CLEANED');
  perform pg_temp.reject('select pg_temp.object(1000)','DU409','CLEANED_OBJECT_RESURRECTION');
  perform pg_temp.reject('select pg_temp.finish(1000)','DU409','CLEANED_FINALIZATION');
end; $$;
do $$ declare f uuid; receipt jsonb; begin
  perform pg_temp.prepare(1001); perform pg_temp.hold(1001,true);
  perform pg_temp.reject('select pg_temp.claim(1001)','DU409','HELD_CLAIM');
  perform pg_temp.hold(1001,false); f:=(pg_temp.claim(1001)->>'fence')::uuid;
  perform pg_temp.hold(1001,true);
  perform pg_temp.reject(format('select pg_temp.authorize(1001,%L)',f),'DU409','HELD_AUTHORIZATION');
  perform pg_temp.hold(1001,false);
  perform pg_temp.prepare(1002); perform pg_temp.object(1002); receipt:=pg_temp.finish(1002);
  update public.profiles set status='disabled' where id=pg_temp.uid(1);
  perform pg_temp.check(public.reconcile_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1002))=receipt,
    'PRIVATE_RECEIPT_RECOVERY_AFTER_REVOCATION');
  perform pg_temp.reject('select pg_temp.claim(1002)','DU409','FINALIZED_NOT_CLEANUP');
  update storage.objects set last_accessed_at=clock_timestamp(),updated_at=clock_timestamp()
    where name=(select storage_path from public.document_upload_operations where operation_id=pg_temp.uid(1002));
  perform pg_temp.reject('update storage.objects set metadata=''{}'' where name=(select storage_path from public.document_upload_operations where operation_id=pg_temp.uid(1002))',
    'DU409','FINALIZED_CONTENT_IMMUTABLE');
  perform pg_temp.authorize(1001,f); perform pg_temp.complete(1001,f,true);
  perform pg_temp.check((select count(*) from public.document_versions)=1 and
    (select count(*) from public.document_lifecycle_audit where event='upload_finalized')=1,'FINALIZED_HISTORY_PRESERVED');
  perform pg_temp.check(not exists(select 1 from public.document_lifecycle_audit
    where event<>'upload_finalized' and (actor_id is not null or actor_kind<>'system')),'TRUTHFUL_SYSTEM_AUDIT');
  perform pg_temp.reject('select public.claim_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(999),pg_temp.uid(1002),300)',
    'DU403','WORKER_FULL_SCOPE');
end; $$;
set local role service_role;
do $$ begin
 if public.reconcile_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1002))->>'status'<>'finalized' then
   raise exception 'SERVICE_WORKER_RECOVERY_MISSING';
 end if;
end; $$;
reset role;
-- Trusted-owner expired reservation. Unlike the old Task4a fixture, creating its
-- object now must fail; finalization remains expired without any uploaded bytes.
insert into public.document_upload_operations(operation_id,actor_id,tenant_id,company_id,
 document_id,doc_type,payload_fingerprint,object_id,reserved_version_id,storage_path,
 mime_type,extension,size_bytes,sha256,safe_filename,prepared_at,deadline_at)
values(pg_temp.uid(1004),pg_temp.uid(1),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1404),'other',
 repeat('c',64),pg_temp.uid(1504),pg_temp.uid(1604),
 pg_temp.uid(100)::text||'/'||pg_temp.uid(101)::text||'/documents/'||pg_temp.uid(1004)::text||'/'||pg_temp.uid(1504)::text||'.pdf',
 'application/pdf','pdf',8,repeat('a',64),'synthetic.pdf',statement_timestamp()-interval '16 minutes',statement_timestamp()-interval '1 minute');
select pg_temp.reject('select pg_temp.object(1004)','DU409','EXPIRED_LATE_STORAGE_WRITER');
-- Namespace compatibility controls: these are not the operation/object namespace.
insert into storage.objects(bucket_id,name,metadata) values
 ('tenant-documents','legacy/synthetic.pdf','{}'),
 ('tenant-documents','tenant/company/pro-credentials/synthetic.pdf','{}'),
 ('tenant-documents','tenant/company/recordings/synthetic.webm','{}');
update storage.objects set metadata='{"fixture":true}' where name='legacy/synthetic.pdf';
select pg_temp.check((select count(*) from storage.objects where name in
 ('legacy/synthetic.pdf','tenant/company/pro-credentials/synthetic.pdf','tenant/company/recordings/synthetic.webm'))=3,
 'LEGACY_CREDENTIAL_RECORDING_COMPATIBILITY');
insert into storage.buckets(id,name,public) values('cleanup-compat-other','cleanup-compat-other',false);
insert into storage.objects(bucket_id,name,metadata)
 select 'cleanup-compat-other',storage_path,'{}' from public.document_upload_operations where operation_id=pg_temp.uid(1004);
select pg_temp.check(exists(select 1 from storage.objects where bucket_id='cleanup-compat-other'),'OTHER_BUCKET_UNTOUCHED');
update public.profiles set status='active' where id=pg_temp.uid(1);
select pg_temp.reject('select pg_temp.finish(1004)','DU410','EXPIRED_WITHOUT_STORAGE');
select pg_temp.prepare(1003);
select pg_temp.reject('select pg_temp.claim(1003,0)','DU422','LEASE_LOWER_BOUND');
select pg_temp.reject('select pg_temp.claim(1003,301)','DU422','LEASE_UPPER_BOUND');
create function pg_temp.audit_failure() returns trigger language plpgsql as $$
begin raise exception using errcode='DU422',message='synthetic_audit_failure'; end; $$;
create trigger synthetic_cleanup_audit_failure before insert on public.document_lifecycle_audit
for each row when(new.event='upload_cleanup_claimed') execute function pg_temp.audit_failure();
select pg_temp.reject('select pg_temp.claim(1003)','DU422','CLEANUP_AUDIT_ATOMIC');
select pg_temp.check((select state='prepared' and cleanup_fence is null from public.document_upload_operations
 where operation_id=pg_temp.uid(1003)) and not exists(select 1 from public.document_lifecycle_audit
 where operation_id=pg_temp.uid(1003)),'AUDIT_FAILURE_NO_CLAIM');
drop trigger synthetic_cleanup_audit_failure on public.document_lifecycle_audit;
do $$ declare f uuid; begin
 f:=(pg_temp.claim(1003,1)->>'fence')::uuid;
 perform pg_temp.reject('insert into public.document_versions(id,document_id,tenant_id,storage_path,mime_type,size_bytes,sha256,uploaded_by)
   select reserved_version_id,document_id,tenant_id,storage_path,mime_type,size_bytes,sha256,actor_id
   from public.document_upload_operations where operation_id=pg_temp.uid(1003)','DU409','UNBOUND_LEGACY_CLAIMED_PATH');
 perform pg_temp.authorize(1003,f); perform pg_temp.complete(1003,f,true);
 perform pg_sleep(1.1);
 perform pg_temp.reject(format('select pg_temp.complete(1003,%L,true)',f),'DU409','EXPIRED_COMPLETION_FENCE');
 perform pg_temp.check(public.reconcile_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1003))->>'status'='cleaned',
   'CLEANED_RECOVERY_AFTER_LEASE_EXPIRY');
end; $$;
do $$ declare signature text; r text; begin
  for signature in select oid::regprocedure::text from pg_proc where pronamespace='public'::regnamespace
    and proname in ('reconcile_document_upload_cleanup','claim_document_upload_cleanup',
      'authorize_document_upload_cleanup','complete_document_upload_cleanup','set_document_upload_cleanup_hold') loop
    perform pg_temp.check(has_function_privilege('service_role',signature,'EXECUTE') and
      not has_function_privilege('anon',signature,'EXECUTE') and
      not has_function_privilege('authenticated',signature,'EXECUTE'),'WORKER_RPC_ACLS');
  end loop;
  for signature in select oid::regprocedure::text from pg_proc where pronamespace='public'::regnamespace
    and proname like '\_document\_upload\_%' escape '\' loop
    foreach r in array array['anon','authenticated','service_role'] loop
      perform pg_temp.check(not has_function_privilege(r,signature,'EXECUTE'),'HELPER_ACLS');
    end loop;
  end loop;
end; $$;
select 'DOCUMENT_UPLOAD_CLEANUP_ROLLBACK_PASS';
select 'DOCUMENT_UPLOAD_CLEANUP_ROLLBACK_ASSERTIONS_'||assertions||'_FAILURES_0' from cleanup_assertion_stats;
rollback;
