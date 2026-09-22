\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;

-- SQL metadata simulation only: these storage.objects rows do not prove real
-- uploaded/downloaded bytes. The server coordinator and Storage API own that proof.
do $$
begin
  if to_regclass('public.document_upload_operations') is null then
    raise exception 'DURABLE_UPLOAD_SCHEMA_MISSING';
  end if;
end;
$$;

create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('99030700-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', label; end if;
end;
$$;

insert into public.tenants(id, slug, name) values
  (pg_temp.uid(100), 'doc-lifecycle-one', 'Synthetic One'),
  (pg_temp.uid(200), 'doc-lifecycle-two', 'Synthetic Two');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.uid(n), '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'doc-lifecycle-' || n || '@example.invalid',
  '', now(), '{}', '{}', now(), now() from generate_series(1, 7) n;
insert into public.profiles(id, tenant_id, role, status) values
  (pg_temp.uid(1), null, 'super_admin', 'active'),
  (pg_temp.uid(2), null, 'admin', 'active'),
  (pg_temp.uid(3), null, 'pro', 'active'),
  (pg_temp.uid(4), pg_temp.uid(100), 'customer', 'active'),
  (pg_temp.uid(5), pg_temp.uid(100), 'employee', 'active'),
  (pg_temp.uid(6), pg_temp.uid(200), 'customer', 'active'),
  (pg_temp.uid(7), pg_temp.uid(100), 'customer', 'disabled');
insert into public.company_profiles(id, tenant_id, company_name) values
  (pg_temp.uid(101), pg_temp.uid(100), 'Synthetic One'),
  (pg_temp.uid(201), pg_temp.uid(200), 'Synthetic Two');
insert into public.customer_profiles(profile_id, linked_company_id) values
  (pg_temp.uid(4), pg_temp.uid(101)), (pg_temp.uid(6), pg_temp.uid(201)),
  (pg_temp.uid(7), pg_temp.uid(101));
insert into public.employees(id, tenant_id, company_id, profile_id, name) values
  (pg_temp.uid(110), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(5), 'Synthetic Self'),
  (pg_temp.uid(111), pg_temp.uid(100), pg_temp.uid(101), null, 'Synthetic Other'),
  (pg_temp.uid(210), pg_temp.uid(200), pg_temp.uid(201), null, 'Synthetic Foreign');
insert into public.pro_profiles(profile_id) values (pg_temp.uid(3));
insert into public.pro_credentials(id, pro_profile_id, identifier_ciphertext,
  identifier_hash, identifier_last4, issuing_authority, issue_date, expiry_date,
  state, version, submitted_at, created_by)
values (pg_temp.uid(30), pg_temp.uid(3), 'synthetic', repeat('d',64), 'DD33',
  'Synthetic Authority', current_date - 30, current_date + 365, 'verified', 1, now(), pg_temp.uid(1));
insert into public.pro_company_assignments(id, tenant_id, company_id, pro_profile_id, assigned_by)
values (pg_temp.uid(31), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(3), pg_temp.uid(1));
insert into public.document_requests(id, tenant_id, company_id, employee_id, doc_type, label) values
  (pg_temp.uid(120), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(110), 'passport', 'Synthetic Self'),
  (pg_temp.uid(121), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(111), 'passport', 'Synthetic Other'),
  (pg_temp.uid(122), pg_temp.uid(100), pg_temp.uid(101), null, 'visa', 'Synthetic Company'),
  (pg_temp.uid(220), pg_temp.uid(200), pg_temp.uid(201), null, 'passport', 'Synthetic Foreign');

create function pg_temp.prepare(actor integer, op integer, options jsonb default '{}')
returns jsonb language plpgsql as $$
declare p jsonb;
begin
  p := jsonb_build_object('tenant',pg_temp.uid(100),'company',pg_temp.uid(101),
    'type','other','sha',repeat('a',64),'mime','application/pdf','size',8,
    'extension','pdf','filename','synthetic.pdf') || options;
  return public.prepare_document_upload(pg_temp.uid(actor),(p->>'tenant')::uuid,
    (p->>'company')::uuid,pg_temp.uid(op),(p->>'request')::uuid,(p->>'document')::uuid,
    (p->>'employee')::uuid,p->>'type',p->>'label',(p->>'head')::uuid,p->>'sha',
    p->>'mime',(p->>'size')::bigint,p->>'extension',p->>'filename');
end;
$$;
create function pg_temp.object(op integer, options jsonb default '{}') returns void language plpgsql as $$
declare r public.document_upload_operations;
begin
  select * into strict r from public.document_upload_operations where operation_id = pg_temp.uid(op);
  insert into storage.objects(bucket_id, name, metadata) values ('tenant-documents', r.storage_path,
    jsonb_build_object('size',r.size_bytes,'mimetype',r.mime_type) || options);
end;
$$;
create function pg_temp.finish(actor integer, op integer, options jsonb default '{}')
returns jsonb language plpgsql as $$
declare r public.document_upload_operations; p jsonb;
begin
  select * into strict r from public.document_upload_operations where operation_id = pg_temp.uid(op);
  p := jsonb_build_object('tenant',r.tenant_id,'company',r.company_id,'scan','clean',
    'provider','clamav','scanned',coalesce(r.scan_completed_at,clock_timestamp()),'path',r.storage_path,
    'mime',r.mime_type,'size',r.size_bytes,'sha',r.sha256) || options;
  return public.finalize_document_upload(pg_temp.uid(actor),(p->>'tenant')::uuid,
    (p->>'company')::uuid,pg_temp.uid(op),p->>'scan',p->>'provider',
    (p->>'scanned')::timestamptz,p->>'path',p->>'mime',(p->>'size')::bigint,p->>'sha');
end;
$$;
create function pg_temp.reject_prepare(actor integer, op integer, options jsonb, expected text)
returns void language plpgsql as $$
begin
  begin
    perform pg_temp.prepare(actor,op,options);
  exception when others then
    if sqlstate = expected then return; end if;
    raise exception 'PREPARE_UNEXPECTED_FAILURE';
  end;
  raise exception 'PREPARE_REJECTION_MISSING';
end;
$$;
create function pg_temp.reject_finish(actor integer, op integer, options jsonb, expected text)
returns void language plpgsql as $$
begin
  begin
    perform pg_temp.finish(actor,op,options);
  exception when others then
    if sqlstate = expected then return; end if;
    raise exception 'FINALIZE_UNEXPECTED_FAILURE';
  end;
  raise exception 'FINALIZE_REJECTION_MISSING';
end;
$$;

do $$
declare n text; r text; signature text; table_name text;
begin
  foreach table_name in array array['document_upload_operations','document_lifecycle_audit'] loop
    foreach r in array array['anon','authenticated','service_role'] loop
      perform pg_temp.check(not has_table_privilege(r,'public.'||table_name,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'PRIVATE_ACLS');
    end loop;
    perform pg_temp.check((select relrowsecurity from pg_class where oid = ('public.'||table_name)::regclass),'PRIVATE_RLS');
    perform pg_temp.check(not exists(select 1 from pg_policy where polrelid = ('public.'||table_name)::regclass),'PRIVATE_POLICIES');
  end loop;
  for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in ('prepare_document_upload','finalize_document_upload','get_document_upload_receipt') loop
    perform pg_temp.check(not has_function_privilege('anon',signature,'EXECUTE')
      and not has_function_privilege('authenticated',signature,'EXECUTE')
      and has_function_privilege('service_role',signature,'EXECUTE'),'RPC_EXECUTE_ACLS');
  end loop;
  for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname like '\_document\_upload\_%' escape '\' loop
    perform pg_temp.check(not has_function_privilege('anon',signature,'EXECUTE')
      and not has_function_privilege('authenticated',signature,'EXECUTE')
      and not has_function_privilege('service_role',signature,'EXECUTE'),'HELPER_EXECUTE_ACLS');
  end loop;
  perform pg_temp.check(not has_table_privilege('service_role','public.document_versions','DELETE,TRUNCATE'),'VERSION_DELETE_TRUNCATE_ACLS');
end;
$$;

do $$
declare first jsonb; replay jsonb; receipt jsonb;
begin
  first := pg_temp.prepare(4,1000);
  perform pg_temp.check(first->>'status'='prepared','PREPARED_STATUS');
  perform pg_temp.check(not exists(select 1 from public.documents where id=(first->>'documentId')::uuid)
    and not exists(select 1 from public.document_versions where id=(first->>'versionId')::uuid),'PREPARED_NO_PUBLICATION');
  replay := pg_temp.prepare(4,1000);
  perform pg_temp.check(first = replay,'REPLAY_STABLE');
  perform pg_temp.check((first->>'storagePath') ~ ('^'||pg_temp.uid(100)||'/'||pg_temp.uid(101)||'/documents/'||pg_temp.uid(1000)||'/[0-9a-f-]{36}\.pdf$'),'OPAQUE_CANONICAL_PATH');
  perform pg_temp.reject_prepare(4,1000,'{"size":9}','DU409');
  perform pg_temp.reject_prepare(2,1000,'{}','DU409');
  perform pg_temp.object(1000);
  receipt := pg_temp.finish(4,1000);
  perform pg_temp.check(receipt->>'status'='finalized','FINALIZED_STATUS');
  perform pg_temp.check(receipt = pg_temp.finish(4,1000),'FINALIZED_REPLAY');
  perform pg_temp.reject_finish(4,1000,'{"scan":"infected"}','DU412');
  perform pg_temp.reject_finish(4,1000,'{"provider":"mock"}','DU412');
  perform pg_temp.reject_finish(4,1000,jsonb_build_object('scanned',clock_timestamp()+interval '1 second'),'DU412');
  perform pg_temp.reject_prepare(4,1000,jsonb_build_object('head',first->>'versionId'),'DU409');
  perform pg_temp.check(receipt = pg_temp.prepare(4,1000),'PREPARE_FINALIZED_REPLAY');
  perform pg_temp.check(receipt = public.get_document_upload_receipt(pg_temp.uid(4),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000)),'RECEIPT_REPLAY');
  perform pg_temp.check(not (receipt ?| array['storagePath','sha256','filename']),'PRIVATE_RECEIPT');
  perform pg_temp.check((select count(*) from public.document_versions where document_id=(first->>'documentId')::uuid)=1
    and (select count(*) from public.document_lifecycle_audit where operation_id=pg_temp.uid(1000) and event='upload_finalized')=1,'EXACTLY_ONCE_PUBLICATION');
end;
$$;

-- Every role positive uses independent logical resource chains.
do $$
declare op integer;
begin
  for op in 1001..1003 loop
    perform pg_temp.prepare(op-1000,op,jsonb_build_object('type',case op when 1001 then 'visa' when 1002 then 'ejari' else 'moa' end));
    perform pg_temp.object(op);
    perform pg_temp.finish(op-1000,op);
  end loop;
  perform pg_temp.prepare(5,1004,jsonb_build_object('request',pg_temp.uid(120),'employee',pg_temp.uid(110),'type','passport'));
  perform pg_temp.object(1004);
  perform pg_temp.finish(5,1004);
  perform pg_temp.check((select status='fulfilled' from public.document_requests where id=pg_temp.uid(120)),'OWN_REQUEST_FULFILLED');
  perform pg_temp.finish(5,1004);
  perform pg_temp.prepare(6,1005,jsonb_build_object('tenant',pg_temp.uid(200),'company',pg_temp.uid(201)));
  perform pg_temp.object(1005);
  perform pg_temp.finish(6,1005);
end;
$$;

select pg_temp.reject_prepare(7,1010,'{}','DU403');
select pg_temp.reject_prepare(999,1010,'{}','DU403');
select pg_temp.reject_prepare(4,1010,jsonb_build_object('company',pg_temp.uid(201)),'DU403');
select pg_temp.reject_prepare(4,1010,jsonb_build_object('request',pg_temp.uid(220)),'DU403');
select pg_temp.reject_prepare(4,1010,jsonb_build_object('employee',pg_temp.uid(210)),'DU403');
select pg_temp.reject_prepare(5,1010,'{}','DU403');
select pg_temp.reject_prepare(5,1010,jsonb_build_object('request',pg_temp.uid(121),'employee',pg_temp.uid(111),'type','passport'),'DU403');
select pg_temp.reject_prepare(5,1010,jsonb_build_object('request',pg_temp.uid(120),'employee',pg_temp.uid(110),'type','passport'),'DU409');
select pg_temp.reject_prepare(4,1010,'{"size":0}','DU422');
select pg_temp.reject_prepare(4,1010,'{"size":26214401}','DU422');
select pg_temp.reject_prepare(4,1010,'{"sha":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}','DU422');
select pg_temp.reject_prepare(4,1010,'{"extension":"png"}','DU422');
select pg_temp.reject_prepare(4,1010,'{"filename":"../unsafe.pdf"}','DU422');
select pg_temp.reject_prepare(4,1010,'{"type":"new_custom_type"}','DU422');
select pg_temp.reject_prepare(4,1010,jsonb_build_object('filename',repeat('a',256)),'DU422');
select pg_temp.reject_prepare(4,1010,jsonb_build_object('label',repeat('a',201)),'DU422');

-- Flush the two inherited deferred current-head FKs before owner-only ALTER;
-- keep them immediate throughout this corruption subcase so no events queue.
set constraints all immediate;
do $$
declare doc uuid;
begin
  select document_id into strict doc from public.document_upload_operations where operation_id=pg_temp.uid(1000);
  begin
    update public.documents set doc_type='trade_license' where id=doc;
    raise exception 'VERSIONED_DOCUMENT_OWNERSHIP_MUTABLE';
  exception when sqlstate 'DU409' then null; end;
  begin
    update public.documents set created_at=created_at+interval '1 second' where id=doc;
    raise exception 'VERSIONED_DOCUMENT_CREATED_AT_MUTABLE';
  exception when sqlstate 'DU409' then null; end;
  update public.documents set label='Synthetic relabel',expires_on=current_date+30 where id=doc;
  -- Rollback-only trusted-owner corruption simulation, not a supported mutation.
  -- Bypass ONLY this owned trigger to prove terminal RPC chain checks independently.
  alter table public.documents disable trigger document_upload_documents_immutable;
  update public.documents set doc_type='trade_license' where id=doc;
  perform pg_temp.reject_prepare(4,1000,'{}','DU403');
  perform pg_temp.reject_finish(4,1000,'{}','DU403');
  begin
    perform public.get_document_upload_receipt(pg_temp.uid(4),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000));
    raise exception 'DRIFTED_CHAIN_RECEIPT_ACCEPTED';
  exception when sqlstate 'DU403' then null; end;
  update public.documents set doc_type='other' where id=doc;
  alter table public.documents enable trigger document_upload_documents_immutable;
end;
$$;
set constraints all deferred;

do $$
declare a jsonb; b jsonb;
begin
  -- Sequential transactions simulate two preparations observing the same null head.
  a := pg_temp.prepare(4,1020,'{"type":"aoa"}');
  b := pg_temp.prepare(4,1021,'{"type":"aoa"}');
  perform pg_temp.object(1020); perform pg_temp.object(1021);
  perform pg_temp.finish(4,1020);
  perform pg_temp.reject_finish(4,1021,'{}','DU409');
  perform pg_temp.check(not exists(select 1 from public.document_versions where id=(b->>'versionId')::uuid)
    and (select count(*) from public.documents where tenant_id=pg_temp.uid(100) and company_id=pg_temp.uid(101) and doc_type='aoa')=1,'STALE_LOGICAL_HEAD');
  perform pg_temp.reject_prepare(4,1022,'{"type":"aoa"}','DU409');
  perform pg_temp.prepare(4,1022,jsonb_build_object('type','aoa','document',a->>'documentId','head',a->>'versionId'));
  perform pg_temp.object(1022); perform pg_temp.finish(4,1022);
end;
$$;

do $$
declare op integer;
begin
  for op in 1030..1038 loop
    perform pg_temp.prepare(4,op,jsonb_build_object('type','noc','employee',pg_temp.uid(110),'label',op::text));
  end loop;
  perform pg_temp.reject_finish(4,1030,'{}','DU412');
  perform pg_temp.object(1031); perform pg_temp.reject_finish(4,1031,'{"scan":"infected"}','DU412');
  perform pg_temp.object(1032); perform pg_temp.reject_finish(4,1032,'{"scan":"unavailable"}','DU412');
  perform pg_temp.object(1033); perform pg_temp.reject_finish(4,1033,'{"provider":"mock"}','DU412');
  perform pg_temp.object(1034,'{"size":9}'); perform pg_temp.reject_finish(4,1034,'{}','DU412');
  perform pg_temp.object(1035,'{"mimetype":"image/png"}'); perform pg_temp.reject_finish(4,1035,'{}','DU412');
  perform pg_temp.object(1036); perform pg_temp.reject_finish(4,1036,'{"sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}','DU412');
  perform pg_temp.object(1037); perform pg_temp.reject_finish(4,1037,'{"scanned":"2000-01-01T00:00:00Z"}','DU412');
  perform pg_temp.object(1038); perform pg_temp.reject_finish(4,1038,'{"path":"unowned/path.pdf"}','DU412');
  perform pg_temp.check(not exists(select 1 from public.documents where doc_type='noc' and tenant_id=pg_temp.uid(100)),'UNVERIFIED_PUBLISH_NOTHING');
end;
$$;

do $$
begin
  perform pg_temp.prepare(3,1040,'{"type":"office_lease"}'); perform pg_temp.object(1040);
  update public.pro_credentials set state='revoked' where id=pg_temp.uid(30);
  perform pg_temp.reject_finish(3,1040,'{}','DU403');
  perform pg_temp.reject_prepare(3,1041,'{"type":"office_lease"}','DU403');
  perform pg_temp.check(not exists(select 1 from public.documents where doc_type='office_lease' and tenant_id=pg_temp.uid(100)),'REVOKED_AUTHORITY');
  update public.pro_credentials set state='verified' where id=pg_temp.uid(30);
  update public.pro_company_assignments set status='released',released_at=clock_timestamp(),
    released_by=pg_temp.uid(1),release_reason='Synthetic revocation' where id=pg_temp.uid(31);
  perform pg_temp.reject_finish(3,1040,'{}','DU403');
  perform pg_temp.reject_prepare(3,1041,'{"type":"office_lease"}','DU403');
  update public.pro_company_assignments set status='active',released_at=null,
    released_by=null,release_reason=null where id=pg_temp.uid(31);
  perform pg_temp.prepare(4,1042,'{"type":"insurance_policy"}'); perform pg_temp.object(1042);
  update public.customer_profiles set linked_company_id=null where profile_id=pg_temp.uid(4);
  perform pg_temp.reject_finish(4,1042,'{}','DU403');
  begin
    perform public.get_document_upload_receipt(pg_temp.uid(4),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000));
    raise exception 'REVOKED_FINALIZED_RECEIPT_ACCEPTED';
  exception when sqlstate 'DU403' then null; end;
  update public.customer_profiles set linked_company_id=pg_temp.uid(101) where profile_id=pg_temp.uid(4);
  update public.profiles set status='disabled' where id=pg_temp.uid(4);
  perform pg_temp.reject_finish(4,1042,'{}','DU403');
  update public.profiles set status='active' where id=pg_temp.uid(4);
  update public.tenants set status='suspended' where id=pg_temp.uid(100);
  perform pg_temp.reject_finish(4,1042,'{}','DU403');
  update public.tenants set status='active' where id=pg_temp.uid(100);
  update public.employees set profile_id=null where id=pg_temp.uid(110);
  begin
    perform public.get_document_upload_receipt(pg_temp.uid(5),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1004));
    raise exception 'REVOKED_EMPLOYEE_RECEIPT_ACCEPTED';
  exception when sqlstate 'DU403' then null; end;
  update public.employees set profile_id=pg_temp.uid(5) where id=pg_temp.uid(110);
  perform pg_temp.reject_finish(6,1042,'{}','DU403');
  begin
    perform public.get_document_upload_receipt(pg_temp.uid(6),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1000));
    raise exception 'FOREIGN_RECEIPT_ACCEPTED';
  exception when sqlstate 'DU403' then null; end;
  begin
    perform public.get_document_upload_receipt(pg_temp.uid(4),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(9999));
    raise exception 'UNKNOWN_RECEIPT_ACCEPTED';
  exception when sqlstate 'DU403' then null; end;
end;
$$;

-- Trusted-owner synthetic expired reservation (service_role cannot create it).
insert into public.document_upload_operations(operation_id,actor_id,tenant_id,company_id,
  document_id,doc_type,expected_head,payload_fingerprint,object_id,reserved_version_id,
  storage_path,mime_type,extension,size_bytes,sha256,safe_filename,prepared_at,deadline_at)
select pg_temp.uid(1043),actor_id,tenant_id,company_id,pg_temp.uid(1044),'cv_resume',
  null,payload_fingerprint,pg_temp.uid(1045),pg_temp.uid(1046),
  tenant_id::text||'/'||company_id::text||'/documents/'||pg_temp.uid(1043)::text||'/'||pg_temp.uid(1045)::text||'.pdf',
  mime_type,extension,size_bytes,sha256,safe_filename,
  timestamp with time zone '2000-01-01T00:00:00Z',timestamp with time zone '2000-01-01T00:15:00Z'
from public.document_upload_operations where operation_id=pg_temp.uid(1000);
do $$
begin
  perform pg_temp.object(1043);
  raise exception 'EXPIRED_RESERVATION_OBJECT_CREATE_ACCEPTED';
exception when sqlstate 'DU409' then null;
end;
$$;
select pg_temp.reject_finish(4,1043,jsonb_build_object('scanned','2000-01-01T00:01:00Z'),'DU410');

create function pg_temp.reject_audit() returns trigger language plpgsql as $$
begin raise exception using errcode='DA500',message='SYNTHETIC_AUDIT_FAILURE'; end;
$$;
create trigger synthetic_document_audit_failure before insert on public.document_lifecycle_audit
for each row execute function pg_temp.reject_audit();
do $$
declare p jsonb;
begin
  p := pg_temp.prepare(4,1050,jsonb_build_object('type','visa','request',pg_temp.uid(122))); perform pg_temp.object(1050);
  perform pg_temp.reject_finish(4,1050,'{}','DA500');
  perform pg_temp.check(not exists(select 1 from public.documents where id=(p->>'documentId')::uuid)
    and not exists(select 1 from public.document_versions where id=(p->>'versionId')::uuid)
    and (select state='prepared' and committed_receipt is null from public.document_upload_operations where operation_id=pg_temp.uid(1050))
    and (select status='pending' from public.document_requests where id=pg_temp.uid(122)),'AUDIT_FAILURE_ATOMIC');
end;
$$;
drop trigger synthetic_document_audit_failure on public.document_lifecycle_audit;

-- TRUNCATE CASCADE also touches documents; flush inherited deferred head events
-- so the immutable-history guard, not PostgreSQL's pending-event check, is tested.
set constraints all immediate;
do $$
declare v uuid; attr text;
begin
  select reserved_version_id into strict v from public.document_upload_operations where operation_id=pg_temp.uid(1000);
  foreach attr in array array['storage_path','mime_type','sha256'] loop
    begin
      execute format('update public.document_versions set %I = %L where id = $1',attr,'mutated') using v;
      raise exception 'IMMUTABLE_VERSION_NOT_FENCED';
    exception when sqlstate 'DU409' then null; end;
  end loop;
  begin
    update public.document_versions set created_at=created_at+interval '1 second' where id=v;
    raise exception 'IMMUTABLE_VERSION';
  exception when sqlstate 'DU409' then null; end;
  update public.document_versions set review_status='approved',review_note='Synthetic review',reviewed_by=pg_temp.uid(1),reviewed_at=now() where id=v;
  begin truncate public.document_versions cascade; raise exception 'VERSION_TRUNCATE_NOT_FENCED';
  exception when sqlstate 'DU409' then null; end;
  begin
    update public.document_lifecycle_audit set classification='failure';
    raise exception 'AUDIT_UPDATE_NOT_FENCED';
  exception when sqlstate 'DU409' then null; end;
  begin delete from public.document_lifecycle_audit; raise exception 'AUDIT_DELETE_NOT_FENCED';
  exception when sqlstate 'DU409' then null; end;
  begin truncate public.document_lifecycle_audit; raise exception 'AUDIT_TRUNCATE_NOT_FENCED';
  exception when sqlstate 'DU409' then null; end;
end;
$$;
set constraints all deferred;

select 'DOCUMENT_UPLOAD_LIFECYCLE_ASSERTIONS_PASSED' as assertion;
rollback;
