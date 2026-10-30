\set ON_ERROR_STOP on
\set QUIET on
set statement_timeout = '20s';
begin;
-- Metadata-only, rollback-only synthetic regression. No stored-byte claim.
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
 select ('99030760-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create temporary table wallclock_stats(assertions integer, incorrect_permits integer);
insert into wallclock_stats values(0,0);
create temporary table wallclock_clock(day_offset integer, arm_resource boolean);
insert into wallclock_clock values(0,false);
create temporary sequence wallclock_resource_hits;
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$
begin
 update wallclock_stats set assertions=assertions+1;
 if ok is distinct from true then raise exception '%',label; end if;
end; $$;
-- This seam is created even on the old migration: old RPCs ignore it, allowing
-- meaningful incorrect permits rather than failing merely at missing helper DDL.
create or replace function public._document_upload_business_date()
returns date language sql volatile security definer set search_path = '' as $$
 select (pg_catalog.now() at time zone 'Asia/Dubai')::date+day_offset from pg_temp.wallclock_clock;
$$;
alter function public._document_upload_business_date() owner to postgres;
revoke all on function public._document_upload_business_date() from public, anon, authenticated, service_role;
-- Keep the entire deployed resource helper/guards intact. Advance the test day
-- AFTER its advisory boundary returns, proving a merely early check insufficient.
alter function public._document_upload_lock_resource(uuid,uuid,uuid,uuid,text,uuid,boolean)
 rename to _document_upload_wallclock_fixture_original_resource;
create function public._document_upload_lock_resource(
 p_tenant_id uuid,p_company_id uuid,p_request_id uuid,p_employee_id uuid,
 p_doc_type text,p_document_id uuid,p_allow_fulfilled boolean
) returns public.documents language plpgsql security definer set search_path = '' as $$
declare result public.documents;
begin
 result:=public._document_upload_wallclock_fixture_original_resource(p_tenant_id,p_company_id,
  p_request_id,p_employee_id,p_doc_type,p_document_id,p_allow_fulfilled);
 if (select arm_resource from pg_temp.wallclock_clock) then
  perform pg_catalog.nextval('pg_temp.wallclock_resource_hits'::regclass);
  update pg_temp.wallclock_clock set day_offset=1;
 end if;
 return result;
end; $$;
alter function public._document_upload_lock_resource(uuid,uuid,uuid,uuid,text,uuid,boolean) owner to postgres;
revoke all on function public._document_upload_lock_resource(uuid,uuid,uuid,uuid,text,uuid,boolean)
 from public, anon, authenticated, service_role;

insert into public.tenants(id,slug,name) values(pg_temp.uid(100),'upload-wallclock-fixture','Synthetic');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.uid(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'upload-wallclock-'||n||'@example.invalid','',now(),'{}','{}',now(),now() from generate_series(1,5) n;
insert into public.profiles(id,tenant_id,role,status) values
 (pg_temp.uid(1),null,'super_admin','active'),(pg_temp.uid(2),null,'admin','active'),
 (pg_temp.uid(3),null,'pro','active'),(pg_temp.uid(4),pg_temp.uid(100),'customer','active'),
 (pg_temp.uid(5),pg_temp.uid(100),'employee','active');
insert into public.company_profiles(id,tenant_id,company_name) values(pg_temp.uid(101),pg_temp.uid(100),'Synthetic');
insert into public.customer_profiles(profile_id,linked_company_id) values(pg_temp.uid(4),pg_temp.uid(101));
insert into public.employees(id,tenant_id,company_id,profile_id,name)
 values(pg_temp.uid(110),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(5),'Synthetic');
insert into public.document_requests(id,tenant_id,company_id,employee_id,doc_type,label)
 values(pg_temp.uid(120),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(110),'passport','Synthetic');
insert into public.pro_profiles(profile_id) values(pg_temp.uid(3));
insert into public.pro_credentials(id,pro_profile_id,identifier_ciphertext,identifier_hash,
 identifier_last4,issuing_authority,issue_date,expiry_date,state,version,submitted_at,created_by)
values(pg_temp.uid(30),pg_temp.uid(3),'synthetic',repeat('d',64),'DD33','Synthetic',
 (now() at time zone 'Asia/Dubai')::date-30,(now() at time zone 'Asia/Dubai')::date,
 'verified',1,now(),pg_temp.uid(1));
insert into public.pro_company_assignments(id,tenant_id,company_id,pro_profile_id,assigned_by)
 values(pg_temp.uid(31),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(3),pg_temp.uid(1));
insert into storage.buckets(id,name,public) values('tenant-documents','tenant-documents',false) on conflict(id) do nothing;
create function pg_temp.prepare(actor integer,op integer,kind text default 'other') returns jsonb language sql as $$
 select public.prepare_document_upload(pg_temp.uid(actor),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(op),
 case when actor=5 then pg_temp.uid(120) end,null,case when actor=5 then pg_temp.uid(110) end,
 kind,null,null,repeat('a',64),'application/pdf',8,'pdf','synthetic.pdf');
$$;
create function pg_temp.object(op integer) returns void language plpgsql as $$
declare r public.document_upload_operations;
begin
 select * into strict r from public.document_upload_operations where operation_id=pg_temp.uid(op);
 insert into storage.objects(bucket_id,name,metadata) values('tenant-documents',r.storage_path,
  jsonb_build_object('size',r.size_bytes,'mimetype',r.mime_type));
end; $$;
create function pg_temp.finish(actor integer,op integer) returns jsonb language plpgsql as $$
declare r public.document_upload_operations;
begin
 select * into strict r from public.document_upload_operations where operation_id=pg_temp.uid(op);
 return public.finalize_document_upload(pg_temp.uid(actor),r.tenant_id,r.company_id,r.operation_id,
 'clean','clamav',coalesce(r.scan_completed_at,clock_timestamp()),r.storage_path,r.mime_type,r.size_bytes,r.sha256);
end; $$;
create function pg_temp.receipt(op integer) returns jsonb language sql as $$
 select public.get_document_upload_receipt(pg_temp.uid(3),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(op));
$$;
-- Successful old calls are forcibly rolled back inside each subtransaction;
-- their incorrect permits accumulate without corrupting later test resources.
create function pg_temp.expect_fresh_deny(command text,late boolean) returns void language plpgsql as $$
declare denied boolean:=false; hits_before bigint; hits_after bigint;
begin
 select last_value into hits_before from wallclock_resource_hits;
 begin
  execute command;
  raise exception using errcode='ZT001',message='ROLLBACK_INCORRECT_PERMIT';
 exception
  when sqlstate 'DU403' then denied:=true;
  when sqlstate 'ZT001' then null;
  when others then raise exception 'WALLCLOCK_UNEXPECTED_REJECTION';
 end;
 select last_value into hits_after from wallclock_resource_hits;
 -- Sequence changes survive the subtransaction rollback, unlike clock updates.
 if late then perform pg_temp.check(hits_after>hits_before,'LATE_RESOURCE_BOUNDARY_NOT_REACHED'); end if;
 update wallclock_stats set assertions=assertions+1,incorrect_permits=incorrect_permits+case when denied then 0 else 1 end;
end; $$;
-- Nonexpired PRO positive before the artificial midnight; separate kinds avoid
-- logical-head collisions with the prepared and terminal regression resources.
do $$ declare receipt jsonb; begin
 perform pg_temp.prepare(3,1000,'visa'); perform pg_temp.object(1000);
 receipt:=pg_temp.finish(3,1000);
 perform pg_temp.check(receipt->>'status'='finalized','VALID_PRO_CONTROL');
 perform pg_temp.check(not receipt ?| array['storagePath','objectId','extension','tenantId','companyId'],'MINIMAL_TERMINAL_RECEIPT');
 perform pg_temp.prepare(3,1001,'other'); perform pg_temp.object(1001);
end; $$;
-- Ensure nextval comparison works even for the first armed resource invocation.
select nextval('wallclock_resource_hits') is not null as sequence_initialized \gset
do $$ declare late boolean; commands text[]; command text; before_audit bigint; before_versions bigint;
begin
 commands:=array['select pg_temp.prepare(3,1002,''ejari'')',
  'select pg_temp.finish(3,1001)','select pg_temp.receipt(1001)',
  'select pg_temp.receipt(1000)','select pg_temp.prepare(3,1000,''visa'')',
  'select pg_temp.finish(3,1000)'];
 select count(*) into before_audit from public.document_lifecycle_audit;
 select count(*) into before_versions from public.document_versions;
 foreach late in array array[false,true] loop
  foreach command in array commands loop
   update wallclock_clock set day_offset=case when late then 0 else 1 end,arm_resource=late;
   perform pg_temp.expect_fresh_deny(command,late);
   perform pg_temp.check(not exists(select 1 from public.document_upload_operations where operation_id=pg_temp.uid(1002)),'PREPARE_DENIAL_NO_RESERVATION');
   perform pg_temp.check((select state='prepared' and committed_receipt is null and finalized_at is null
    from public.document_upload_operations where operation_id=pg_temp.uid(1001)),'FINALIZE_DENIAL_ATOMIC_OPERATION');
   perform pg_temp.check(not exists(select 1 from public.documents where id=(select document_id from public.document_upload_operations where operation_id=pg_temp.uid(1001)))
    and (select count(*) from public.document_versions)=before_versions
    and (select count(*) from public.document_lifecycle_audit)=before_audit,'FINALIZE_DENIAL_NO_HEAD_VERSION_AUDIT');
  end loop;
 end loop;
 update wallclock_clock set day_offset=1,arm_resource=false;
 -- Valid tomorrow licence control, then restore expiry-today for revocation.
 update public.pro_credentials set expiry_date=expiry_date+2 where id=pg_temp.uid(30);
 perform pg_temp.check(pg_temp.prepare(3,1003,'moa')->>'status'='prepared','FRESH_PRO_TOMORROW_CONTROL');
 perform pg_temp.object(1003);
 perform pg_temp.check(pg_temp.finish(3,1003)->>'status'='finalized','FRESH_PRO_TOMORROW_PUBLICATION');
 perform pg_temp.check(pg_temp.receipt(1003)->>'status'='finalized','FRESH_PRO_TOMORROW_RECEIPT');
 update public.pro_credentials set expiry_date=expiry_date-2 where id=pg_temp.uid(30);
 perform pg_temp.check(pg_temp.prepare(1,1004,'aoa')->>'status'='prepared','SUPER_ADMIN_CONTROL');
 perform pg_temp.check(pg_temp.prepare(2,1005,'noc')->>'status'='prepared','ADMIN_CONTROL');
 perform pg_temp.check(pg_temp.prepare(4,1006,'cv_resume')->>'status'='prepared','CUSTOMER_CONTROL');
 perform pg_temp.check(pg_temp.prepare(5,1007,'passport')->>'status'='prepared','EMPLOYEE_CONTROL');
 for before_versions in 1004..1007 loop
  perform pg_temp.object(before_versions::integer);
  perform pg_temp.check(pg_temp.finish(case before_versions when 1004 then 1 when 1005 then 2 when 1006 then 4 else 5 end,
   before_versions::integer)->>'status'='finalized','NONPRO_PUBLICATION_CONTROL');
 end loop;
 update public.pro_company_assignments set status='released',released_at=now(),
  released_by=pg_temp.uid(1),release_reason='Synthetic' where id=pg_temp.uid(31);
 update public.profiles set status='disabled' where id=pg_temp.uid(3);
 perform pg_temp.check(public.reconcile_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000))->>'status'='finalized','PRIVATE_WORKER_COMMITTED_PROTECTION');
end; $$;
do $$ declare catalog record; role_name text; public_count integer:=0; begin
 for catalog in select oid,proname,proowner,prosecdef,proconfig from pg_proc
  where pronamespace='public'::regnamespace and (proname in ('prepare_document_upload','finalize_document_upload','get_document_upload_receipt')
   or proname like '\_document\_upload\_%' escape '\') loop
  perform pg_temp.check(catalog.proowner='postgres'::regrole and catalog.proconfig @> array['search_path=""'],'OWNER_EMPTY_SEARCH_PATH');
  foreach role_name in array array['anon','authenticated'] loop
   perform pg_temp.check(not has_function_privilege(role_name,catalog.oid,'EXECUTE'),'NO_CLIENT_EXECUTE');
  end loop;
  if left(catalog.proname,1)='_' then
   perform pg_temp.check(not has_function_privilege('service_role',catalog.oid,'EXECUTE'),'PRIVATE_OWNER_ONLY');
  else
   public_count:=public_count+1;
   perform pg_temp.check(catalog.prosecdef and has_function_privilege('service_role',catalog.oid,'EXECUTE'),'PUBLIC_SERVICE_DEFINER');
  end if;
  perform pg_temp.check(not exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid=catalog.oid and a.grantee=0 and a.privilege_type='EXECUTE'),'NO_PUBLIC_EXECUTE');
 end loop;
 perform pg_temp.check(public_count=3,'THREE_ACTOR_RPC_SIGNATURES');
end; $$;
select 'DOCUMENT_UPLOAD_WALLCLOCK_INCORRECT_PERMITS_'||incorrect_permits from wallclock_stats;
do $$ begin
 if (select incorrect_permits from wallclock_stats)<>0 then raise exception 'DOCUMENT_UPLOAD_WALLCLOCK_AUTHORITY_REGRESSION'; end if;
end; $$;
select 'DOCUMENT_UPLOAD_WALLCLOCK_ASSERTIONS_'||assertions||'_FAILURES_0' from wallclock_stats;
select 'DOCUMENT_UPLOAD_WALLCLOCK_ROLLBACK_PASS';
rollback;
