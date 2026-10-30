\set ON_ERROR_STOP on
\set QUIET on
set statement_timeout = '20s';
begin;
-- Rollback-only metadata simulation, not a physical-provider attestation.
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('99030760-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create temporary table identity_assertion_stats(assertions integer not null);
insert into identity_assertion_stats values(0);
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%',label; end if;
  update identity_assertion_stats set assertions=assertions+1;
end; $$;
insert into public.tenants(id,slug,name) values
 (pg_temp.uid(100),'access-identity-contract','Synthetic'),
 (pg_temp.uid(200),'access-identity-foreign','Synthetic');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,
 email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.uid(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'access-identity-'||n||'@example.invalid','',now(),'{}','{}',now(),now() from generate_series(1,4) n;
insert into public.profiles(id,tenant_id,role,status) values
 (pg_temp.uid(1),pg_temp.uid(100),'customer','active'),
 (pg_temp.uid(2),pg_temp.uid(200),'customer','active'),
 (pg_temp.uid(3),pg_temp.uid(100),'employee','active'),
 (pg_temp.uid(4),null,'admin','active');
insert into public.company_profiles(id,tenant_id,company_name) values
 (pg_temp.uid(101),pg_temp.uid(100),'Synthetic'),(pg_temp.uid(201),pg_temp.uid(200),'Synthetic');
insert into public.customer_profiles(profile_id,linked_company_id) values
 (pg_temp.uid(1),pg_temp.uid(101)),(pg_temp.uid(2),pg_temp.uid(201));
insert into storage.buckets(id,name,public) values('tenant-documents','tenant-documents',false)
on conflict(id) do nothing;
create function pg_temp.publish(op integer,head uuid default null) returns uuid language plpgsql as $$
declare receipt jsonb; r public.document_upload_operations;
begin
 receipt:=public.prepare_document_upload(pg_temp.uid(1),pg_temp.uid(100),pg_temp.uid(101),
 pg_temp.uid(op),null,null,null,'other',null,head,repeat('a',64),'application/pdf',8,'pdf','synthetic.pdf');
 select * into strict r from public.document_upload_operations where operation_id=pg_temp.uid(op);
 insert into storage.objects(bucket_id,name,metadata) values('tenant-documents',r.storage_path,
 jsonb_build_object('size',8,'mimetype','application/pdf'));
 receipt:=public.finalize_document_upload(r.actor_id,r.tenant_id,r.company_id,r.operation_id,
 'clean','clamav',clock_timestamp(),r.storage_path,r.mime_type,r.size_bytes,r.sha256);
 perform pg_temp.check(receipt->>'status'='finalized','VALID_OWNER_FINALIZED');
 return r.reserved_version_id;
end; $$;
create temporary table identity_versions(kind text primary key,id uuid);
insert into identity_versions values('history',pg_temp.publish(1000));
insert into identity_versions values('latest',pg_temp.publish(1001,(select id from identity_versions where kind='history')));
create function pg_temp.access_fixture(actor integer,version uuid,company integer default 101,tenant integer default 100)
returns jsonb language sql as $$
 select public.resolve_document_access(pg_temp.uid(actor),pg_temp.uid(tenant),pg_temp.uid(company),
 (select document_id from public.document_versions where id=version),version,120);
$$;
create function pg_temp.denied(actor integer,version uuid,label text,company integer default 101,tenant integer default 100)
returns void language plpgsql as $$
declare verdict jsonb; prior uuid[]; a public.document_access_audit;
begin
 select coalesce(array_agg(id),array[]::uuid[]) into prior from public.document_access_audit;
 verdict:=pg_temp.access_fixture(actor,version,company,tenant);
 perform pg_temp.check(verdict=jsonb_build_object('status','denied'),label||'_EXACT_STATUS');
 select * into strict a from public.document_access_audit where not(id=any(prior));
 perform pg_temp.check(a.event='access_denied' and a.phase='resolve'
 and a.actor_id is not distinct from (select id from public.profiles where id=pg_temp.uid(actor))
 and a.tenant_id is null and a.company_id is null and a.document_id is null
 and a.version_id is null and a.operation_id is null and a.sha256 is null,
 label||'_SPECIFIC_NEW_AUDIT_PERSISTED');
end; $$;
do $$ declare verdict jsonb; r public.document_upload_operations; fixture_kind text; grant_before bigint;
begin
 select count(*) into grant_before from public.document_access_audit where event='access_granted';
 foreach fixture_kind in array array['history','latest'] loop
  select * into strict r from public.document_upload_operations
   where reserved_version_id=(select id from identity_versions where identity_versions.kind=fixture_kind);
  verdict:=pg_temp.access_fixture(1,r.reserved_version_id);
  perform pg_temp.check(verdict->>'status'='allowed','VALID_OWNER_ACCESS_ALLOWED');
  perform pg_temp.check(verdict->>'objectId'=r.object_id::text and verdict->>'extension'=r.extension,
   'ACCESS_INDEPENDENT_OBJECT_EXTENSION_MISSING');
  perform pg_temp.check(verdict->>'storagePath'=(verdict->>'tenantId')||'/'||(verdict->>'companyId')
   ||'/documents/'||(verdict->>'operationId')||'/'||(verdict->>'objectId')||'.'||(verdict->>'extension'),
   'ACCESS_CANONICAL_RECOMPUTE');
  perform pg_temp.check((verdict-array['objectId','extension','expiresAt'])=(public._document_access_context(
   pg_temp.uid(1),r.tenant_id,r.company_id,r.document_id,r.reserved_version_id,120)
   -'expiresAt'), 'ORIGINAL_PRIVATE_KEYS_PRESERVED');
 end loop;
 perform pg_temp.denied(2,(select id from identity_versions where kind='latest'),'FOREIGN_ACTOR');
 perform pg_temp.denied(3,(select id from identity_versions where kind='latest'),'EMPLOYEE_NO_SELF_REQUEST');
 perform pg_temp.denied(999,(select id from identity_versions where kind='latest'),'UNKNOWN_ACTOR');
 perform pg_temp.denied(1,(select id from identity_versions where kind='history'),'FOREIGN_HISTORY',201,200);
 perform pg_temp.denied(1,pg_temp.uid(999),'UNKNOWN_VERSION');
 perform pg_temp.check((select count(*)=grant_before from public.document_access_audit where event='access_granted'),
  'RESOLUTION_NEVER_WRITES_GRANT_EVENT');
end; $$;
insert into public.documents(id,tenant_id,company_id,doc_type)
values(pg_temp.uid(130),pg_temp.uid(100),pg_temp.uid(101),'passport');
insert into public.document_versions(id,document_id,tenant_id,storage_path,mime_type,size_bytes,sha256,uploaded_by)
values(pg_temp.uid(140),pg_temp.uid(130),pg_temp.uid(100),'legacy/synthetic.pdf','application/pdf',8,repeat('b',64),pg_temp.uid(1));
select pg_temp.denied(1,pg_temp.uid(140),'UNVERIFIED_LEGACY');
-- Reader authority is current; immutable uploader provenance is historical.
-- Earlier owner positives and all customer denial controls ran while active.
update public.profiles set status='disabled' where id=pg_temp.uid(1);
do $$ declare verdict jsonb; r public.document_upload_operations; fixture_kind text; grant_before bigint;
begin
 select count(*) into grant_before from public.document_access_audit where event='access_granted';
 foreach fixture_kind in array array['history','latest'] loop
  select * into strict r from public.document_upload_operations
   where reserved_version_id=(select id from identity_versions where identity_versions.kind=fixture_kind);
  perform pg_temp.check(r.actor_id=pg_temp.uid(1) and r.actor_id<>pg_temp.uid(4)
   and exists(select 1 from public.profiles where id=r.actor_id and status='disabled'),
   'DIFFERENT_READER_DISABLED_UPLOADER_PROVEN');
  verdict:=pg_temp.access_fixture(4,r.reserved_version_id);
  perform pg_temp.check(verdict->>'status'='allowed','CURRENT_READER_HISTORICAL_UPLOADER_ALLOWED');
  perform pg_temp.check(verdict->>'objectId'=r.object_id::text and verdict->>'extension'=r.extension,
   'DIFFERENT_READER_INDEPENDENT_IDENTITY');
  perform pg_temp.check(verdict->>'storagePath'=(verdict->>'tenantId')||'/'||(verdict->>'companyId')
   ||'/documents/'||(verdict->>'operationId')||'/'||(verdict->>'objectId')||'.'||(verdict->>'extension'),
   'DIFFERENT_READER_CANONICAL_RECOMPUTE');
  perform pg_temp.check((verdict-array['objectId','extension','expiresAt'])=(public._document_access_context(
   pg_temp.uid(4),r.tenant_id,r.company_id,r.document_id,r.reserved_version_id,120)
   -'expiresAt'), 'DIFFERENT_READER_ORIGINAL_KEYS_PRESERVED');
 end loop;
 update public.profiles set status='disabled' where id=pg_temp.uid(4);
 perform pg_temp.denied(4,(select id from identity_versions where kind='latest'),'CURRENT_READER_DISABLED');
 perform pg_temp.check((select count(*)=grant_before from public.document_access_audit where event='access_granted'),
  'DIFFERENT_READER_RESOLUTION_NO_GRANT_EVENT');
end; $$;
do $$ declare p record; role_name text; n integer:=0; begin
 for p in select oid,proname,prosecdef,proowner,proconfig from pg_proc
 where pronamespace='public'::regnamespace and proname in
 ('resolve_document_access','_document_access_resolve_before_provider_identity') loop
  n:=n+1;
  perform pg_temp.check(p.prosecdef and p.proowner='postgres'::regrole
   and p.proconfig @> array['search_path=""'],'ACCESS_IDENTITY_PRIVATE_OWNER_SEARCH_PATH');
  foreach role_name in array array['anon','authenticated','service_role'] loop
   perform pg_temp.check(has_function_privilege(role_name,p.oid,'EXECUTE')=
    (role_name='service_role' and p.proname='resolve_document_access'),'ACCESS_IDENTITY_LEAST_PRIVILEGE');
  end loop;
 end loop;
 perform pg_temp.check(n=2,'ACCESS_IDENTITY_WRAPPER_DELEGATE_EXIST');
 perform pg_temp.check(not has_table_privilege('service_role','public.document_upload_operations','SELECT'),
  'NO_PRIVATE_OPERATION_READ_GRANT');
end; $$;
select 'DOCUMENT_ACCESS_IDENTITY_ASSERTIONS='||assertions as result from identity_assertion_stats;
rollback;
