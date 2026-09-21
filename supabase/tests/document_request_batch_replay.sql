\set ON_ERROR_STOP on
\set QUIET on
set statement_timeout = '20s';
begin;

-- Rollback-only metadata fixture. It proves database atomicity, replay and
-- privilege boundaries; it makes no browser or physical-file claim.
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('99030770-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create temp table batch_results(kind text primary key, receipt jsonb);
grant all on pg_temp.batch_results to service_role;
create temp table assertions(label text primary key);
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', label; end if;
  insert into pg_temp.assertions values(label);
end;
$$;
create function pg_temp.items() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('doc_type','passport','label','Passport copy'),
    jsonb_build_object('doc_type','other','custom_type_label','Board resolution',
      'label','Board resolution','notes','Signed copy')
  );
$$;
create function pg_temp.expect_denied(actor integer, tenant integer, company integer, op integer)
returns void language plpgsql as $$
begin
  begin
    perform public.create_document_request_batch(
      pg_temp.uid(op), pg_temp.uid(actor), pg_temp.uid(tenant),
      pg_temp.uid(company), pg_temp.items()
    );
    raise exception using errcode='ZT001', message='UNEXPECTED_BATCH_PERMIT';
  exception
    when sqlstate 'DR403' then null;
    when sqlstate 'ZT001' then raise;
    when others then raise exception 'UNEXPECTED_BATCH_DENIAL_%', sqlstate;
  end;
end;
$$;
create function pg_temp.expect_rpc_privilege_denied()
returns void language plpgsql as $$
begin
  begin
    perform public.create_document_request_batch(
      pg_temp.uid(999), pg_temp.uid(1), pg_temp.uid(100),
      pg_temp.uid(101), pg_temp.items()
    );
    raise exception using errcode='ZT001', message='UNEXPECTED_RPC_PERMIT';
  exception
    when insufficient_privilege then null;
    when sqlstate 'ZT001' then raise;
    when others then raise exception 'UNEXPECTED_RPC_DENIAL_%', sqlstate;
  end;
end;
$$;

insert into public.tenants(id,slug,name) values
  (pg_temp.uid(100),'batch-fixture-one','Synthetic One'),
  (pg_temp.uid(200),'batch-fixture-two','Synthetic Two');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.uid(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'batch-fixture-'||n||'@example.invalid','',now(),'{}','{}',now(),now()
from generate_series(1,5) n;
insert into public.profiles(id,tenant_id,role,status) values
  (pg_temp.uid(1),null,'pro','active'),
  (pg_temp.uid(2),null,'pro','disabled'),
  (pg_temp.uid(3),null,'pro','active'),
  (pg_temp.uid(4),null,'pro','active'),
  (pg_temp.uid(5),null,'admin','active');
insert into public.pro_profiles(profile_id) values
  (pg_temp.uid(1)),(pg_temp.uid(2)),(pg_temp.uid(3)),(pg_temp.uid(4));
insert into public.company_profiles(id,tenant_id,company_name) values
  (pg_temp.uid(101),pg_temp.uid(100),'Synthetic One'),
  (pg_temp.uid(201),pg_temp.uid(200),'Synthetic Two');
insert into public.pro_company_assignments(id,tenant_id,company_id,pro_profile_id,assigned_by)
values
  (pg_temp.uid(11),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1),pg_temp.uid(5)),
  (pg_temp.uid(13),pg_temp.uid(200),pg_temp.uid(201),pg_temp.uid(3),pg_temp.uid(5));

set local role service_role;
insert into pg_temp.batch_results(kind,receipt)
select 'first', public.create_document_request_batch(
  pg_temp.uid(900),pg_temp.uid(1),pg_temp.uid(100),pg_temp.uid(101),pg_temp.items()
);
reset role;
select pg_temp.check(
  (select jsonb_array_length(receipt->'request_ids')=2 and receipt->>'replayed'='false'
    from pg_temp.batch_results where kind='first')
  and (select count(*)=2 from public.document_requests where requested_by=pg_temp.uid(1)),
  'FIRST_BATCH_ATOMIC'
);
select pg_temp.check(
  (select count(*)=1 from public.document_request_batch_operations where operation_id=pg_temp.uid(900))
  and (select count(*)=1 from public.tenant_audit_log
    where actor_id=pg_temp.uid(1) and details->>'operation_id'=pg_temp.uid(900)::text),
  'ONE_AUDIT_ONE_RECEIPT'
);

set local role service_role;
insert into pg_temp.batch_results(kind,receipt)
select 'replay', public.create_document_request_batch(
  pg_temp.uid(900),pg_temp.uid(1),pg_temp.uid(100),pg_temp.uid(101),pg_temp.items()
);
reset role;
select pg_temp.check(
  (select receipt->'request_ids' from pg_temp.batch_results where kind='first')
    = (select receipt->'request_ids' from pg_temp.batch_results where kind='replay')
  and (select receipt->>'replayed'='true' from pg_temp.batch_results where kind='replay')
  and (select array_agg(request.label order by ids.ordinality)
        = array['Passport copy','Board resolution']
      from pg_temp.batch_results result
      cross join lateral jsonb_array_elements_text(result.receipt->'request_ids')
        with ordinality as ids(id,ordinality)
      join public.document_requests request on request.id=ids.id::uuid
      where result.kind='first')
  and (select count(*)=2 from public.document_requests where requested_by=pg_temp.uid(1))
  and (select count(*)=1 from public.tenant_audit_log
    where actor_id=pg_temp.uid(1) and details->>'operation_id'=pg_temp.uid(900)::text),
  'ORDERED_REPLAY_NO_DUPLICATES'
);

set local role service_role;
do $$ begin
  begin
    perform public.create_document_request_batch(
      pg_temp.uid(900),pg_temp.uid(1),pg_temp.uid(100),pg_temp.uid(101),
      jsonb_build_array(jsonb_build_object('doc_type','visa','label','Different'))
    );
    raise exception using errcode='ZT001',message='UNEXPECTED_CONFLICT_PERMIT';
  exception
    when sqlstate 'DR409' then null;
    when sqlstate 'ZT001' then raise;
    when others then raise exception 'UNEXPECTED_CONFLICT_%',sqlstate;
  end;
end; $$;
reset role;
select pg_temp.check(
  (select count(*)=2 from public.document_requests where requested_by=pg_temp.uid(1))
  and (select count(*)=1 from public.document_request_batch_operations where operation_id=pg_temp.uid(900))
  and (select count(*)=1 from public.tenant_audit_log
    where actor_id=pg_temp.uid(1) and details->>'operation_id'=pg_temp.uid(900)::text),
  'CONFLICT_NO_FRAGMENTS'
);

set local role service_role;
select pg_temp.expect_denied(2,100,101,901);
select pg_temp.expect_denied(3,100,101,902);
select pg_temp.expect_denied(4,100,101,903);
reset role;
select pg_temp.check(not exists(select 1 from public.document_request_batch_operations
  where operation_id in (pg_temp.uid(901),pg_temp.uid(902),pg_temp.uid(903)))
  and (select count(*)=2 from public.document_requests where requested_by=pg_temp.uid(1))
  and (select count(*)=1 from public.tenant_audit_log
    where actor_id=pg_temp.uid(1) and details->>'operation_id'=pg_temp.uid(900)::text),
  'INACTIVE_ACTOR_DENIED');
select pg_temp.check(not exists(select 1 from public.document_requests
  where requested_by=pg_temp.uid(3)),'FOREIGN_ACTOR_DENIED');
select pg_temp.check(not exists(select 1 from public.document_requests
  where requested_by=pg_temp.uid(4)),'UNASSIGNED_ACTOR_DENIED');

set local role service_role;
do $$ begin
  begin
    insert into public.document_requests(tenant_id,company_id,requested_by,doc_type,label)
    values(pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1),'passport','Forbidden');
    raise exception using errcode='ZT001',message='UNEXPECTED_DIRECT_REQUEST_INSERT';
  exception when insufficient_privilege then null; when sqlstate 'ZT001' then raise; end;
  begin
    insert into public.document_request_batch_operations(
      operation_id,tenant_id,actor_id,company_id,request_fingerprint,request_ids
    ) values(pg_temp.uid(904),pg_temp.uid(100),pg_temp.uid(1),pg_temp.uid(101),repeat('a',64),'["00000000-0000-0000-0000-000000000001"]');
    raise exception using errcode='ZT001',message='UNEXPECTED_DIRECT_RECEIPT_INSERT';
  exception when insufficient_privilege then null; when sqlstate 'ZT001' then raise; end;
end; $$;
reset role;
select pg_temp.check(not exists(select 1 from public.document_request_batch_operations
  where operation_id=pg_temp.uid(904)),'DIRECT_TABLE_MUTATION_DENIED');

set local role anon;
select pg_temp.expect_rpc_privilege_denied();
reset role;
select pg_temp.check(true,'ANON_RPC_DENIED');
set local role authenticated;
select pg_temp.expect_rpc_privilege_denied();
reset role;
select pg_temp.check(true,'AUTHENTICATED_RPC_DENIED');
select pg_temp.check(
  (select receipt->>'replayed'='false' from pg_temp.batch_results where kind='first'),
  'SERVICE_ROLE_POSITIVE_CONTROL'
);

select 'DOCUMENT_REQUEST_BATCH_ASSERTIONS_'||count(*)||'_FAILURES_0' from pg_temp.assertions;
select 'DOCUMENT_REQUEST_BATCH_ROLLBACK_PASS';
rollback;
