\set ON_ERROR_STOP on
\set QUIET on
set statement_timeout = '20s';
begin;
-- Disposable owner fixtures, valid immutable reservations; no trigger bypass.
-- SQL checks metadata/ACL only, not physical provider byte absence.
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('99030750-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create temporary table provider_assertion_stats(assertions integer not null);
insert into provider_assertion_stats values(0);
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$
begin
  update provider_assertion_stats set assertions=assertions+1;
  if ok is distinct from true then raise exception '%',label; end if;
end; $$;
create function pg_temp.reject(sql text,code text,label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlstate=code then update provider_assertion_stats set assertions=assertions+1; return; end if;
    raise exception 'UNEXPECTED_REJECTION_%',label;
  end;
  raise exception 'REJECTION_MISSING_%',label;
end; $$;
insert into public.tenants(id,slug,name) values
 (pg_temp.uid(100),'provider-identity-contract','Synthetic'),
 (pg_temp.uid(200),'provider-identity-other','Synthetic');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,
 email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.uid(1),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'provider-identity@example.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,role,status) values(pg_temp.uid(1),'super_admin','active');
insert into public.company_profiles(id,tenant_id,company_name) values
 (pg_temp.uid(101),pg_temp.uid(100),'Synthetic'),(pg_temp.uid(201),pg_temp.uid(200),'Synthetic');
insert into storage.buckets(id,name,public) values('tenant-documents','tenant-documents',false)
on conflict(id) do nothing;
create function pg_temp.prepare(op integer,sha text default repeat('a',64),expected_head uuid default null) returns jsonb language sql as $$
select public.prepare_document_upload(pg_temp.uid(1),pg_temp.uid(100),pg_temp.uid(101),
 pg_temp.uid(op),null,null,null,'other',null,
 expected_head,
 sha,'application/pdf',8,'pdf','synthetic.pdf');
$$;
create function pg_temp.identity(payload jsonb,op integer) returns void language plpgsql as $$
declare r public.document_upload_operations; begin
 select * into strict r from public.document_upload_operations where operation_id=pg_temp.uid(op);
 perform pg_temp.check(payload->>'tenantId'=r.tenant_id::text and payload->>'companyId'=r.company_id::text
 and payload->>'operationId'=r.operation_id::text and payload->>'objectId'=r.object_id::text
 and payload->>'documentId'=r.document_id::text and payload->>'versionId'=r.reserved_version_id::text
 and payload->>'extension'=r.extension and payload->>'storageBucket'='tenant-documents'
 and payload->>'storagePath'=r.tenant_id::text||'/'||r.company_id::text||'/documents/'
 ||r.operation_id::text||'/'||r.object_id::text||'.'||r.extension,'PRIVATE_IDENTITY_INDEPENDENT');
end; $$;
create function pg_temp.candidates(lim integer default 25,tenant uuid default pg_temp.uid(100),company uuid default pg_temp.uid(101))
returns jsonb language plpgsql as $$
begin
 return public.list_document_upload_cleanup_candidates(tenant,company,lim);
end;
$$;
do $$ declare first jsonb; replay jsonb; claim jsonb; authz jsonb; f uuid; receipt jsonb; r public.document_upload_operations;
begin
 first:=pg_temp.prepare(1000); perform pg_temp.identity(first,1000);
 perform pg_temp.check(first->>'status'='prepared' and first ? 'deadlineAt','PREPARED_FIELDS_PRESERVED');
 replay:=pg_temp.prepare(1000); perform pg_temp.check(replay=first,'PREPARE_REPLAY_UNCHANGED');
 perform pg_temp.reject('select pg_temp.prepare(1000,repeat(''b'',64))','DU409','PAYLOAD_CONFLICT_UNCHANGED');
 perform pg_temp.identity(public.reconcile_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000)),1000);
 claim:=public.claim_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000),300);
 perform pg_temp.identity(claim,1000); f:=(claim->>'fence')::uuid;
 perform pg_temp.check(claim->>'status'='cleanup_pending' and claim ? 'leaseUntil','CLAIM_FIELDS_PRESERVED');
 perform pg_temp.check(public.claim_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000),300)=claim,'CLAIM_REPLAY_UNCHANGED');
 perform pg_temp.reject('select public.authorize_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000),pg_temp.uid(99))','DU409','STALE_FENCE');
 authz:=public.authorize_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000),f);
 perform pg_temp.identity(authz,1000);
 perform pg_temp.check(authz->>'status'='delete_authorized' and authz->>'fence'=f::text and authz->>'leaseUntil'=claim->>'leaseUntil','AUTHORIZE_FIELDS_PRESERVED');
 perform pg_temp.reject('select public.set_document_upload_cleanup_hold(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000),true)','DU409','NO_LATE_HOLD');
 perform pg_temp.check(public.complete_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000),f,false)->>'status'='cleanup_pending','FAILURE_PENDING');
 perform public.complete_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000),f,true);
 perform pg_temp.check(public.reconcile_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000))=jsonb_build_object('status','cleaned','operationId',pg_temp.uid(1000)),'CLEANED_RECONCILABLE');
 perform pg_temp.reject('select pg_temp.prepare(1000)','DU409','NO_RESURRECTION');
 perform pg_temp.prepare(1001);
 select * into r from public.document_upload_operations where operation_id=pg_temp.uid(1001);
 insert into storage.objects(bucket_id,name,metadata) values('tenant-documents',r.storage_path,jsonb_build_object('size',r.size_bytes,'mimetype',r.mime_type));
 receipt:=public.finalize_document_upload(r.actor_id,r.tenant_id,r.company_id,r.operation_id,'clean','clamav',clock_timestamp(),r.storage_path,r.mime_type,r.size_bytes,r.sha256);
 perform pg_temp.check(receipt->>'status'='finalized' and not receipt ?| array['storagePath','objectId','extension','tenantId','companyId'],'TERMINAL_PUBLIC_RECEIPT');
 perform pg_temp.check(pg_temp.prepare(1001)=receipt,'FINALIZED_PREPARE_REPLAY');
 perform pg_temp.check(public.reconcile_document_upload_cleanup(r.tenant_id,r.company_id,r.operation_id)=receipt,'FINALIZED_PRIVATE_RECONCILE');
 perform pg_temp.reject('select public.claim_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1001),300)','DU409','FINALIZED_REFERENCED_EXCLUDED');
 perform pg_temp.reject('select public.reconcile_document_upload_cleanup(pg_temp.uid(200),pg_temp.uid(201),pg_temp.uid(1001))','DU403','FOREIGN_RECONCILE');
end; $$;
-- Correct immutable past timestamps are supplied only when initially inserting
-- expired owner fixtures; deployed guards and receipt constraints remain active.
insert into public.document_upload_operations(operation_id,actor_id,tenant_id,company_id,
 document_id,doc_type,payload_fingerprint,object_id,reserved_version_id,storage_path,
 mime_type,extension,size_bytes,sha256,safe_filename,prepared_at,deadline_at)
select pg_temp.uid(n),pg_temp.uid(1),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(n+1000),'other',
 repeat('c',64),pg_temp.uid(n+2000),pg_temp.uid(n+3000),
 pg_temp.uid(100)::text||'/'||pg_temp.uid(101)::text||'/documents/'||pg_temp.uid(n)::text||'/'||pg_temp.uid(n+2000)::text||'.pdf',
 'application/pdf','pdf',8,repeat('a',64),'synthetic.pdf',statement_timestamp()-interval '16 minutes',statement_timestamp()-interval '1 minute'
from generate_series(2000,2029) n;
select public.set_document_upload_cleanup_hold(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(2000),true) is not null as hold_established \gset
-- An actual expiring claim supplies the pending candidate, not an invented fence.
select public.claim_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(2001),1) is not null as short_claim_established \gset
select pg_temp.prepare(1002,repeat('a',64),(select current_version_id from public.documents where tenant_id=pg_temp.uid(100) and company_id=pg_temp.uid(101) and doc_type='other')) is not null as live_prepared \gset
select public.claim_document_upload_cleanup(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(2002),300) is not null as live_claim \gset
select pg_sleep(1.1) is null as short_lease_elapsed \gset
do $$ declare one jsonb; many jsonb; candidate jsonb; expected jsonb; begin
 one:=pg_temp.candidates(1); many:=pg_temp.candidates(25);
 perform pg_temp.check(one->>'status'='candidates' and jsonb_array_length(one->'operations')=1,'DISCOVERY_LOWER_BOUND');
 perform pg_temp.check(jsonb_array_length(many->'operations')=25,'DISCOVERY_UPPER_BOUND');
 perform pg_temp.check(many=pg_temp.candidates(25),'DISCOVERY_DETERMINISTIC');
 select jsonb_agg(operation_id::text order by deadline_at,operation_id) into expected from
 (select operation_id,deadline_at from public.document_upload_operations where operation_id between pg_temp.uid(2001) and pg_temp.uid(2029)
 and operation_id<>pg_temp.uid(2002) order by deadline_at,operation_id limit 25) q;
 perform pg_temp.check((select jsonb_agg(x->>'operationId' order by ordinal) from jsonb_array_elements(many->'operations') with ordinality a(x,ordinal))=expected,'DISCOVERY_STABLE_ORDER');
 for candidate in select value from jsonb_array_elements(many->'operations') loop
  perform pg_temp.identity(candidate,right(candidate->>'operationId',12)::integer);
 end loop;
 perform pg_temp.check(one->'operations'->0->>'operationId'=pg_temp.uid(2001)::text,'EXPIRED_PENDING_INCLUDED');
 perform pg_temp.check(jsonb_array_length(pg_temp.candidates(25,pg_temp.uid(200),pg_temp.uid(201))->'operations')=0,'OTHER_SCOPE_EMPTY');
 perform pg_temp.check(jsonb_array_length(pg_temp.candidates(25,pg_temp.uid(100),pg_temp.uid(201))->'operations')=0,'CROSS_SCOPE_EMPTY');
 perform pg_temp.check(jsonb_array_length(pg_temp.candidates(25,pg_temp.uid(999),pg_temp.uid(998))->'operations')=0,'UNKNOWN_SCOPE_EMPTY');
 perform pg_temp.reject('select pg_temp.candidates(0)','DU422','LIMIT_ZERO');
 perform pg_temp.reject('select pg_temp.candidates(26)','DU422','LIMIT_26');
 perform pg_temp.reject('select pg_temp.candidates(null)','DU422','LIMIT_NULL');
 perform pg_temp.reject('select pg_temp.candidates(1,null,pg_temp.uid(101))','DU422','TENANT_NULL');
 perform pg_temp.reject('select pg_temp.candidates(1,pg_temp.uid(100),null)','DU422','COMPANY_NULL');
 perform pg_temp.reject('select public.list_document_upload_cleanup_candidates(''malformed''::uuid,pg_temp.uid(101),1)','22P02','UUID_MALFORMED');
end; $$;
do $$ declare signature text; r text; n integer:=0; private_count integer:=0; catalog record; begin
 for catalog in select oid::regprocedure::text as signature,prosecdef,proowner,proconfig from pg_proc where pronamespace='public'::regnamespace
 and proname in ('prepare_document_upload','claim_document_upload_cleanup','authorize_document_upload_cleanup',
 'reconcile_document_upload_cleanup','list_document_upload_cleanup_candidates') loop
  n:=n+1;
  signature:=catalog.signature;
  perform pg_temp.check(catalog.prosecdef and catalog.proowner='postgres'::regrole
  and catalog.proconfig @> array['search_path=""'],'PROVIDER_RPC_DEFINER_OWNER_SEARCH_PATH');
  perform pg_temp.check(has_function_privilege('service_role',signature,'EXECUTE')
  and not has_function_privilege('anon',signature,'EXECUTE')
  and not has_function_privilege('authenticated',signature,'EXECUTE'),'PROVIDER_RPC_ACL');
 end loop;
 perform pg_temp.check(n=5,'ALL_PROVIDER_RPCS_EXIST');
 for catalog in select oid::regprocedure::text as signature,proname,prosecdef,proowner,proconfig from pg_proc where pronamespace='public'::regnamespace
 and proname like '\_document\_upload\_%' escape '\' loop
  signature:=catalog.signature;
  perform pg_temp.check(catalog.proowner='postgres'::regrole
  and catalog.proconfig @> array['search_path=""'],'PRIVATE_HELPER_OWNER_SEARCH_PATH');
  if catalog.proname in ('_document_upload_provider_identity','_document_upload_prepare_before_provider_identity',
    '_document_upload_claim_before_provider_identity','_document_upload_authorize_before_provider_identity',
    '_document_upload_reconcile_before_provider_identity') then
   private_count:=private_count+1;
   perform pg_temp.check(catalog.prosecdef,'PROVIDER_PRIVATE_DEFINER');
  end if;
  if catalog.proname='_document_upload_guard_version' then
   perform pg_temp.check(not catalog.prosecdef,'INHERITED_VERSION_GUARD_REMAINS_INVOKER');
  end if;
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.check(not has_function_privilege(r,signature,'EXECUTE'),'PRIVATE_HELPER_ACL');
  end loop;
 end loop;
 perform pg_temp.check(private_count=5,'ALL_PROVIDER_PRIVATE_HELPERS_EXIST');
 perform pg_temp.check(not has_table_privilege('service_role','public.document_upload_operations','SELECT'),'NO_PRIVATE_TABLE_GRANT');
end; $$;
update public.profiles set status='disabled' where id=pg_temp.uid(1);
do $$ begin
 perform pg_temp.check(jsonb_array_length(pg_temp.candidates(1)->'operations')=1,'DISCOVERY_AFTER_UPLOADER_REVOCATION');
end; $$;
set local role service_role;
do $$ begin
 if jsonb_array_length(public.list_document_upload_cleanup_candidates(pg_temp.uid(100),pg_temp.uid(101),1)->'operations')<>1 then
  raise exception 'SERVICE_DISCOVERY_MISSING';
 end if;
end; $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.list_document_upload_cleanup_candidates(pg_temp.uid(100),pg_temp.uid(101),1);
 exception when insufficient_privilege then return; end;
 raise exception 'ANON_DISCOVERY_ALLOWED';
end; $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.list_document_upload_cleanup_candidates(pg_temp.uid(100),pg_temp.uid(101),1);
 exception when insufficient_privilege then return; end;
 raise exception 'AUTHENTICATED_DISCOVERY_ALLOWED';
end; $$;
reset role;
select 'DOCUMENT_UPLOAD_PROVIDER_IDENTITY_ROLLBACK_PASS';
select 'DOCUMENT_UPLOAD_PROVIDER_IDENTITY_ASSERTIONS_'||assertions||'_FAILURES_0' from provider_assertion_stats;
rollback;
