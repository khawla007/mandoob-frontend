begin;

do $p309_bank_evidence_assertions$
declare
  v_definition text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and relation.relname='bank_transfer_submissions'
      and relation.relrowsecurity=true
  ) then raise exception 'bank evidence table or RLS missing'; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='bank_transfer_submissions'
      and column_name in ('filename','storage_path','signed_url','blob','bank_account')
  ) then raise exception 'private storage or bank data column present'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='bank_transfer_submissions'
      and column_name='policy_key' and is_nullable='YES' and column_default is null
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='bank_transfer_submissions'
      and column_name='expires_at' and is_nullable='YES' and column_default is null
  ) then raise exception 'retention must default to no policy and no expiry'; end if;

  select pg_catalog.pg_get_functiondef(proc.oid) into v_definition
  from pg_catalog.pg_proc proc join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
  where namespace.nspname='public' and proc.proname='p309_review_bank_evidence';
  if v_definition is null or v_definition not like '%legal_hold is true%'
    or v_definition not like '%investigation_hold is true%'
    or v_definition not like '%tombstone%'
    or v_definition not like '%document_id is null%version_id is null%finalized_at is null%'
    or v_definition not like '%bank_evidence_operation_receipts%'
    or v_definition not like '%finance.bank_evidence.reviewed%'
  then raise exception 'hold/tombstone enforcement missing'; end if;

  select pg_catalog.pg_get_functiondef(proc.oid) into v_definition
  from pg_catalog.pg_proc proc join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
  where namespace.nspname='public' and proc.proname='p309_resolve_bank_evidence_access';
  if v_definition is null or v_definition not like '%review_state%pending%clean%'
    or v_definition not like '%expires_at%clock_timestamp%'
    or v_definition not like '%tombstoned_at is not null%'
  then raise exception 'access state/expiry gate missing'; end if;

  select pg_catalog.pg_get_functiondef(proc.oid) into v_definition
  from pg_catalog.pg_proc proc join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
  where namespace.nspname='public' and proc.proname='p309_finalize_bank_evidence';
  if v_definition is null or v_definition not like '%review_state is distinct from ''pending''%'
    or v_definition not like '%reviewed_by is not null%reviewed_at is not null%'
    or v_definition not like '%finance.bank_evidence.submitted%'
  then raise exception 'finalize state/event guard missing'; end if;

  if (select count(*) from public.event_contract_registrations
    where (event_type,event_version) in (
      ('finance.bank_evidence.submitted',1),('finance.bank_evidence.reviewed',1)
    )) <> 2 then raise exception 'frozen bank evidence event contracts missing'; end if;

  if not exists (
    select 1 from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and relation.relname='bank_evidence_operation_receipts'
      and relation.relrowsecurity=true
  ) then raise exception 'durable review receipt table or RLS missing'; end if;

  if exists (
    select 1 from cron.job where jobname ilike '%bank%evidence%'
  ) then raise exception 'automatic bank evidence purge/expiry job must not exist'; end if;

  if exists (
    select 1 from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
    where namespace.nspname='public' and proc.proname like 'p309_%bank%evidence%'
      and (not proc.prosecdef or not ('search_path=""'=any(proc.proconfig)))
  ) then raise exception 'bank evidence RPC security/search_path contract missing'; end if;
end;
$p309_bank_evidence_assertions$;

-- Seed only reference identities needed to exercise the finance transaction. Replica
-- mode avoids invoking unrelated product triggers in this disposable rollback fixture.
set local session_replication_role = replica;
insert into public.tenants(id,slug,name,status)
values ('10000000-0000-4000-8000-000000000001','p309-fixture','P309 fixture','active');
insert into public.company_profiles(id,tenant_id,company_name)
values ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Fixture company');
insert into public.profiles(id,role,status)
values ('30000000-0000-4000-8000-000000000003','admin','active');
insert into public.profiles(id,tenant_id,role,status)
values ('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','pro','active');
insert into public.pro_company_assignments(tenant_id,company_id,pro_profile_id,assigned_by)
values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000003');
insert into public.invoices(id,tenant_id,company_id,label,amount_minor,currency,status)
values ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002','Fixture invoice',1000,'AED','open');
update public.invoices set ledger_eligible=true,finalized_at=pg_catalog.clock_timestamp()
where id='40000000-0000-4000-8000-000000000004';
insert into public.bank_transfer_submissions(
  id,tenant_id,company_id,customer_profile_id,invoice_id,actor_id,operation_id
) values (
  '50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000006',
  '40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000007'
), (
  '50000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000006',
  '40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000017'
), (
  '50000000-0000-4000-8000-000000000025','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000006',
  '40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000027'
), (
  '50000000-0000-4000-8000-000000000035','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000006',
  '40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000037'
), (
  '50000000-0000-4000-8000-000000000045','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000006',
  '40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000047'
);
update public.bank_transfer_submissions set
  document_id='80000000-0000-4000-8000-000000000008',
  version_id='90000000-0000-4000-8000-000000000009',finalized_at=pg_catalog.clock_timestamp(),version=1
where id in (
  '50000000-0000-4000-8000-000000000015','50000000-0000-4000-8000-000000000025',
  '50000000-0000-4000-8000-000000000035','50000000-0000-4000-8000-000000000045'
);
update public.bank_transfer_submissions set review_state='expired',reviewed_by='30000000-0000-4000-8000-000000000003',
  reviewed_at=pg_catalog.clock_timestamp(),version=2
where id='50000000-0000-4000-8000-000000000035';
update public.bank_transfer_submissions set review_state='tombstoned',reviewed_by='30000000-0000-4000-8000-000000000003',
  reviewed_at=pg_catalog.clock_timestamp(),tombstoned_at=pg_catalog.clock_timestamp(),version=2
where id='50000000-0000-4000-8000-000000000045';

do $p309_review_before_finalize$
begin
  perform public.p309_review_bank_evidence(
    '30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-00000000000a',0,'pending',repeat('a',64),'clean',null
  );
  raise exception 'review-before-finalize unexpectedly succeeded';
exception when sqlstate 'P3099' then null;
end;
$p309_review_before_finalize$;

do $p309_review_replay$
declare v_first jsonb; v_replay jsonb;
begin
  v_first:=public.p309_review_bank_evidence(
    '30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000015',
    'a0000000-0000-4000-8000-00000000001a',1,'pending',repeat('b',64),'clean',null
  );
  v_replay:=public.p309_review_bank_evidence(
    '30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000015',
    'a0000000-0000-4000-8000-00000000001a',1,'pending',repeat('b',64),'clean',null
  );
  if v_first->>'status'<>'clean' or (v_first->>'version')::bigint<>2
    or (v_first->>'replayed')::boolean or not (v_replay->>'replayed')::boolean
  then raise exception 'review receipt replay mismatch'; end if;
  begin
    perform public.p309_review_bank_evidence(
      '30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000015',
      'a0000000-0000-4000-8000-00000000001a',1,'pending',repeat('c',64),'clean',null
    );
    raise exception 'changed review replay unexpectedly succeeded';
  exception when sqlstate 'P3099' then null; end;
  if (select count(*) from public.bank_evidence_operation_receipts
      where operation_id='a0000000-0000-4000-8000-00000000001a')<>1
    or (select count(*) from public.domain_events
      where event_type='finance.bank_evidence.reviewed'
        and correlation_id='a0000000-0000-4000-8000-00000000001a')<>1
  then raise exception 'review receipt/event not atomically unique'; end if;
end;
$p309_review_replay$;

do $p309_allocation_boundaries$
declare v_first jsonb; v_replay jsonb; v_denied uuid;
begin
  v_first:=public.p309_allocate_reviewed_bank_payment(
    '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-00000000003a',
    0,repeat('e',64),'40000000-0000-4000-8000-000000000004',
    '50000000-0000-4000-8000-000000000015',500,null
  );
  v_replay:=public.p309_allocate_reviewed_bank_payment(
    '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-00000000003a',
    0,repeat('e',64),'40000000-0000-4000-8000-000000000004',
    '50000000-0000-4000-8000-000000000015',500,null
  );
  if (v_first->>'replayed')::boolean or not (v_replay->>'replayed')::boolean
    or v_first->>'paymentId' is null or v_replay->>'paymentId' is distinct from v_first->>'paymentId'
  then raise exception 'evidence allocation exact replay mismatch'; end if;
  begin
    perform public.p309_allocate_reviewed_bank_payment(
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-00000000003a',
      0,repeat('f',64),'40000000-0000-4000-8000-000000000004',
      '50000000-0000-4000-8000-000000000015',500,null
    );
    raise exception 'changed allocation replay unexpectedly succeeded';
  exception when unique_violation then null; end;
  if not exists (select 1 from public.bank_transfer_submissions where id='50000000-0000-4000-8000-000000000015'
      and review_state='reconciled' and version=3)
    or not exists (select 1 from public.finance_audit_log where action='finance.bank_evidence_reconciled'
      and resource_id='50000000-0000-4000-8000-000000000015')
  then raise exception 'allocation did not version and audit evidence'; end if;

  foreach v_denied in array array[
    '50000000-0000-4000-8000-000000000005'::uuid,
    '50000000-0000-4000-8000-000000000035'::uuid,
    '50000000-0000-4000-8000-000000000045'::uuid
  ] loop
    begin
      perform public.p309_allocate_reviewed_bank_payment(
        '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
        '30000000-0000-4000-8000-000000000013',gen_random_uuid(),1,repeat('1',64),
        '40000000-0000-4000-8000-000000000004',v_denied,100,null
      );
      raise exception 'non-clean evidence allocation unexpectedly succeeded';
    exception when sqlstate 'P3094' then null; end;
  end loop;

  begin
    perform public.p309_allocate_reviewed_bank_payment(
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000099',
      '30000000-0000-4000-8000-000000000013',gen_random_uuid(),1,repeat('2',64),
      '40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000015',100,null
    );
    raise exception 'cross-company service-role allocation unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end;
$p309_allocation_boundaries$;

savepoint p309_event_rollback;
select public.p309_review_bank_evidence(
  '30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000025',
  'a0000000-0000-4000-8000-00000000002a',1,'pending',repeat('d',64),'rejected','fixture'
);
rollback to savepoint p309_event_rollback;
do $p309_event_rollback_assert$
begin
  if exists (select 1 from public.bank_evidence_operation_receipts
      where operation_id='a0000000-0000-4000-8000-00000000002a')
    or exists (select 1 from public.domain_events
      where correlation_id='a0000000-0000-4000-8000-00000000002a')
    or exists (select 1 from public.bank_transfer_submissions
      where id='50000000-0000-4000-8000-000000000025' and review_state<>'pending')
  then raise exception 'review mutation/event survived savepoint rollback'; end if;
end;
$p309_event_rollback_assert$;

set local session_replication_role = origin;

rollback;
