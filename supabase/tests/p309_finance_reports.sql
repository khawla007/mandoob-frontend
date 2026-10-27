begin;

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('94700000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','p309-report-customer@example.invalid','synthetic',now(),'{}','{}',now(),now()),
  ('94700000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','p309-report-pro@example.invalid','synthetic',now(),'{}','{}',now(),now()),
  ('94700000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','p309-report-admin@example.invalid','synthetic',now(),'{}','{}',now(),now()),
  ('94700000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','p309-report-customer-two@example.invalid','synthetic',now(),'{}','{}',now(),now());
insert into public.tenants(id,slug,name,status) values
  ('94700000-0000-4000-8000-000000000010','p309-report','P309 Report','active'),
  ('94700000-0000-4000-8000-000000000011','p309-report-other','P309 Other Report','active');
insert into public.company_profiles(id,tenant_id,company_name) values
  ('94700000-0000-4000-8000-000000000020','94700000-0000-4000-8000-000000000010','P309 Report Company'),
  ('94700000-0000-4000-8000-000000000021','94700000-0000-4000-8000-000000000011','Other Report Company');
insert into public.profiles(id,tenant_id,role,status,full_name) values
  ('94700000-0000-4000-8000-000000000001','94700000-0000-4000-8000-000000000010','customer','active','Report Customer'),
  ('94700000-0000-4000-8000-000000000002','94700000-0000-4000-8000-000000000010','pro','active','Report PRO'),
  ('94700000-0000-4000-8000-000000000004','94700000-0000-4000-8000-000000000010','customer','active','Report Customer Two');
insert into public.profiles(id,role,status,full_name) values
  ('94700000-0000-4000-8000-000000000003','admin','active','Report Admin');
insert into public.pro_profiles(profile_id) values('94700000-0000-4000-8000-000000000002');
insert into public.customer_profiles(profile_id,linked_company_id) values
  ('94700000-0000-4000-8000-000000000001','94700000-0000-4000-8000-000000000020'),
  ('94700000-0000-4000-8000-000000000004','94700000-0000-4000-8000-000000000020');
insert into public.pro_company_assignments(id,tenant_id,company_id,pro_profile_id,assigned_at,assigned_by)
values('94700000-0000-4000-8000-000000000022','94700000-0000-4000-8000-000000000010',
  '94700000-0000-4000-8000-000000000020','94700000-0000-4000-8000-000000000002',now(),
  '94700000-0000-4000-8000-000000000003');
insert into public.invoices(id,tenant_id,company_id,label,amount_minor,currency,status,ledger_eligible,version,finalized_at)
values('94700000-0000-4000-8000-000000000030','94700000-0000-4000-8000-000000000010',
  '94700000-0000-4000-8000-000000000020','Unowned receipt',100,'AED','open',true,1,now());
insert into public.invoices(id,tenant_id,company_id,customer_profile_id,label,amount_minor,currency,status,ledger_eligible,version,finalized_at)
values('94700000-0000-4000-8000-000000000031','94700000-0000-4000-8000-000000000010',
  '94700000-0000-4000-8000-000000000020','94700000-0000-4000-8000-000000000001',
  'Cross-link receipt',100,'AED','open',true,1,now());

do $p309_null_receipt_owner$
begin
  begin
    perform public.p309_generate_finance_receipt(
      '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000001','customer','94700000-0000-4000-8000-000000000030',
      'invoice','94700000-0000-4000-8000-000000000030');
    raise exception 'NULL_RECEIPT_OWNER_ACCEPTED';
  exception when insufficient_privilege then null; end;
end;
$p309_null_receipt_owner$;

-- Simulate a stale/corrupt cross-company link to prove the service-role RPC does
-- not trust the invoice owner id alone. Production FKs prevent creating this
-- state through normal writes.
set local session_replication_role=replica;
update public.customer_profiles set linked_company_id='94700000-0000-4000-8000-000000000021'
where profile_id='94700000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
do $p309_cross_link_receipt_owner$
begin
  begin
    perform public.p309_generate_finance_receipt(
      '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000001','customer','94700000-0000-4000-8000-000000000031',
      'invoice','94700000-0000-4000-8000-000000000031');
    raise exception 'CROSS_LINK_RECEIPT_OWNER_ACCEPTED';
  exception when insufficient_privilege then null; end;
end;
$p309_cross_link_receipt_owner$;
set local session_replication_role=replica;
update public.customer_profiles set linked_company_id='94700000-0000-4000-8000-000000000020'
where profile_id='94700000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

do $p309_immutable_receipt_snapshot$
declare
  v_result jsonb;v_invoice uuid;v_payment uuid;v_refund uuid;
  v_invoice_before jsonb;v_payment_before jsonb;v_refund_before jsonb;
begin
  v_result:=public.p309_create_invoice_draft(
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
    '94700000-0000-4000-8000-000000000002','94700000-0000-4000-8000-000000000100',0,repeat('a',64),
    '94700000-0000-4000-8000-000000000001','Immutable receipt',current_date+7,
    '[{"description":"Snapshot service","quantity":1,"unitAmountMinor":1000,"discountMinor":0,"taxCategory":"standard","taxBasis":"exclusive","vatBasisPoints":500,"currency":"AED"}]'::jsonb);
  v_invoice:=(v_result->>'invoiceId')::uuid;
  perform public.p309_finalize_invoice(
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
    '94700000-0000-4000-8000-000000000002','94700000-0000-4000-8000-000000000101',1,repeat('b',64),v_invoice);
  if not coalesce((public.p309_get_customer_invoice(
      '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000001',v_invoice)->>'receipt_available')::boolean,false)
    or not coalesce((public.p309_get_company_invoice(
      '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000002',v_invoice)->>'receipt_available')::boolean,false)
    or coalesce((public.p309_get_customer_invoice(
      '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000001','94700000-0000-4000-8000-000000000031')
      ->>'receipt_available')::boolean,true)
  then raise exception 'RECEIPT_AVAILABILITY_NOT_SNAPSHOT_DERIVED'; end if;
  v_invoice_before:=public.p309_generate_finance_receipt(
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
    '94700000-0000-4000-8000-000000000001','customer',v_invoice,'invoice',v_invoice);
  v_result:=public.p309_allocate_manual_payment(
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
    '94700000-0000-4000-8000-000000000002','94700000-0000-4000-8000-000000000102',2,repeat('c',64),
    v_invoice,1050,'cash','snapshot payment');
  v_payment:=(v_result->>'paymentId')::uuid;
  v_payment_before:=public.p309_generate_finance_receipt(
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
    '94700000-0000-4000-8000-000000000001','customer',v_invoice,'payment',v_payment);
  v_result:=public.p309_prepare_refund(
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
    '94700000-0000-4000-8000-000000000002','94700000-0000-4000-8000-000000000103',3,repeat('d',64),
    v_invoice,v_payment,250,'snapshot refund');
  v_refund:=(v_result->>'refundId')::uuid;
  perform public.p309_reconcile_refund(
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
    '94700000-0000-4000-8000-000000000002','94700000-0000-4000-8000-000000000104',4,repeat('e',64),
    v_invoice,v_payment,v_refund,null,'succeeded');
  v_refund_before:=public.p309_generate_finance_receipt(
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
    '94700000-0000-4000-8000-000000000001','customer',v_invoice,'refund',v_refund);

  update public.tenants set name='Changed tenant',primary_color='#ffffff'
    where id='94700000-0000-4000-8000-000000000010';
  update public.company_profiles set company_name='Changed company'
    where id='94700000-0000-4000-8000-000000000020';
  update public.profiles set full_name='Changed customer'
    where id='94700000-0000-4000-8000-000000000001';
  update public.refunds set reason='Changed refund reason' where id=v_refund;

  if v_invoice_before is distinct from public.p309_generate_finance_receipt(
      '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000001','customer',v_invoice,'invoice',v_invoice)
    or v_payment_before is distinct from public.p309_generate_finance_receipt(
      '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000001','customer',v_invoice,'payment',v_payment)
    or v_refund_before is distinct from public.p309_generate_finance_receipt(
      '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000001','customer',v_invoice,'refund',v_refund)
  then raise exception 'RECEIPT_SNAPSHOT_CHANGED'; end if;
  if (v_invoice_before->>'vatMinor')::bigint<>50 or v_invoice_before->>'tenantName'<>'P309 Report'
    or v_invoice_before->>'status'<>'open' or v_payment_before->>'status'<>'succeeded'
    or (v_refund_before->>'refundedMinor')::bigint<>250
  then raise exception 'RECEIPT_SNAPSHOT_CONTENT_INVALID'; end if;
end;
$p309_immutable_receipt_snapshot$;

do $p309_report_behavior$
declare
  v_company jsonb;v_client jsonb;v_platform jsonb;v_month_a jsonb;v_month_b jsonb;v_zero jsonb;
  v_page_one jsonb;v_page_two jsonb;v_cursor jsonb;v_journal uuid;v_source uuid;
  v_receipt uuid;v_operation uuid;v_index integer;
  v_start timestamptz:=(pg_catalog.date_trunc('month',pg_catalog.now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai');
  v_end timestamptz:=v_start+interval '1 month';
begin
  insert into public.invoices(id,tenant_id,company_id,customer_profile_id,label,amount_minor,currency,
    status,ledger_eligible,version,finalized_at) values
    ('94700000-0000-4000-8000-000000000040','94700000-0000-4000-8000-000000000010',
      '94700000-0000-4000-8000-000000000020','94700000-0000-4000-8000-000000000004',
      'Company USD',1200,'USD','open',true,1,now()),
    ('94700000-0000-4000-8000-000000000041','94700000-0000-4000-8000-000000000011',
      '94700000-0000-4000-8000-000000000021',null,'Platform USD',500,'USD','open',true,1,now()),
    ('94700000-0000-4000-8000-000000000042','94700000-0000-4000-8000-000000000011',
      '94700000-0000-4000-8000-000000000021',null,'Export fixture',1,'AED','open',true,1,now());
  insert into public.finance_operation_receipts(id,tenant_id,company_id,actor_id,operation_id,
    aggregate_kind,aggregate_id,expected_version,committed_version,payload_hash,sanitized_result) values
    ('94700000-0000-4000-8000-000000000050','94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000003','94700000-0000-4000-8000-000000000150','invoice','94700000-0000-4000-8000-000000000040',0,1,repeat('1',64),'{}'),
    ('94700000-0000-4000-8000-000000000051','94700000-0000-4000-8000-000000000011','94700000-0000-4000-8000-000000000021',
      '94700000-0000-4000-8000-000000000003','94700000-0000-4000-8000-000000000151','invoice','94700000-0000-4000-8000-000000000041',0,1,repeat('2',64),'{}'),
    ('94700000-0000-4000-8000-000000000052','94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000003','94700000-0000-4000-8000-000000000152','invoice','94700000-0000-4000-8000-000000000030',0,1,repeat('3',64),'{}'),
    ('94700000-0000-4000-8000-000000000053','94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000003','94700000-0000-4000-8000-000000000153','invoice','94700000-0000-4000-8000-000000000030',1,2,repeat('4',64),'{}'),
    ('94700000-0000-4000-8000-000000000054','94700000-0000-4000-8000-000000000011','94700000-0000-4000-8000-000000000021',
      '94700000-0000-4000-8000-000000000003','94700000-0000-4000-8000-000000000154','invoice','94700000-0000-4000-8000-000000000042',0,1,repeat('5',64),'{}');

  insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at) values
    ('94700000-0000-4000-8000-000000000060','94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020','94700000-0000-4000-8000-000000000050','invoice','94700000-0000-4000-8000-000000000040','USD',now()),
    ('94700000-0000-4000-8000-000000000061','94700000-0000-4000-8000-000000000011','94700000-0000-4000-8000-000000000021','94700000-0000-4000-8000-000000000051','invoice','94700000-0000-4000-8000-000000000041','USD',now()),
    ('94700000-0000-4000-8000-000000000062','94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020','94700000-0000-4000-8000-000000000052','invoice','94700000-0000-4000-8000-000000000030','AED','2026-08-15 08:00:00+00');
  insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,credit_minor,currency) values
    ('94700000-0000-4000-8000-000000000060',1,'receivable',1200,0,'USD'),('94700000-0000-4000-8000-000000000060',2,'service_revenue',0,1200,'USD'),
    ('94700000-0000-4000-8000-000000000061',1,'receivable',500,0,'USD'),('94700000-0000-4000-8000-000000000061',2,'service_revenue',0,500,'USD'),
    ('94700000-0000-4000-8000-000000000062',1,'receivable',100,0,'AED'),('94700000-0000-4000-8000-000000000062',2,'service_revenue',0,100,'AED');
  perform private.p309_post_journal('94700000-0000-4000-8000-000000000060');
  perform private.p309_post_journal('94700000-0000-4000-8000-000000000061');
  perform private.p309_post_journal('94700000-0000-4000-8000-000000000062');
  update public.invoices set status='void',voided_at='2026-09-15 08:00:00+00',version=2
    where id='94700000-0000-4000-8000-000000000030';
  insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
    values('94700000-0000-4000-8000-000000000063','94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
      '94700000-0000-4000-8000-000000000053','invoice_void','94700000-0000-4000-8000-000000000030','AED','2026-09-15 08:00:00+00');
  insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,credit_minor,currency) values
    ('94700000-0000-4000-8000-000000000063',1,'service_revenue',100,0,'AED'),
    ('94700000-0000-4000-8000-000000000063',2,'receivable',0,100,'AED');
  perform private.p309_post_journal('94700000-0000-4000-8000-000000000063');

  v_company:=public.p309_finance_report('94700000-0000-4000-8000-000000000002',
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',null,v_start,v_end);
  v_client:=public.p309_finance_report('94700000-0000-4000-8000-000000000002',
    '94700000-0000-4000-8000-000000000010','94700000-0000-4000-8000-000000000020',
    '94700000-0000-4000-8000-000000000001',v_start,v_end);
  v_platform:=public.p309_finance_report('94700000-0000-4000-8000-000000000003',null,null,null,v_start,v_end);
  if (v_company#>>'{currencies,AED,cashCollectedMinor}')::bigint<>800
    or (v_company#>>'{currencies,AED,billedMinor}')::bigint<>800
    or (v_company#>>'{currencies,AED,revenueMinor}')::bigint<>762
    or (v_company#>>'{currencies,USD,revenueMinor}')::bigint<>1200
    or (v_client#>'{currencies,USD}') is not null
    or (v_platform#>>'{currencies,USD,revenueMinor}')::bigint<>1700
  then raise exception 'REPORT_SCOPE_CASH_CREDIT_OR_CURRENCY_FAILED'; end if;
  v_zero:=public.p309_finance_report('94700000-0000-4000-8000-000000000003',null,null,null,
    '2020-01-01 00:00:00+00','2020-02-01 00:00:00+00');
  if v_zero->'currencies'<>'{}'::jsonb then raise exception 'ZERO_PERIOD_FAILED'; end if;
  v_month_a:=public.p309_finance_report('94700000-0000-4000-8000-000000000003',null,null,null,
    '2026-07-31 20:00:00+00','2026-08-31 20:00:00+00');
  v_month_b:=public.p309_finance_report('94700000-0000-4000-8000-000000000003',null,null,null,
    '2026-08-31 20:00:00+00','2026-09-30 20:00:00+00');
  if (v_month_a#>>'{currencies,AED,billedMinor}')::bigint<>100
    or (v_month_a#>>'{currencies,AED,revenueMinor}')::bigint<>100
    or (v_month_b#>>'{currencies,AED,billedMinor}')::bigint<>-100
    or (v_month_b#>>'{currencies,AED,revenueMinor}')::bigint<>-100
  then raise exception 'RECOGNITION_REVERSAL_PERIOD_FAILED'; end if;

  for v_index in 1..1005 loop
    v_journal:=private.p309_event_uuid('report-export-fixture:'||v_index::text);
    v_source:=private.p309_event_uuid('report-export-source:'||v_index::text);
    v_receipt:=private.p309_event_uuid('report-export-receipt:'||v_index::text);
    v_operation:=private.p309_event_uuid('report-export-operation:'||v_index::text);
    insert into public.invoices(id,tenant_id,company_id,label,amount_minor,currency,status,ledger_eligible,version,finalized_at)
    values(v_source,'94700000-0000-4000-8000-000000000011','94700000-0000-4000-8000-000000000021',
      'Export fixture '||v_index::text,1,'AED','open',true,1,'2024-01-15 08:00:00+00');
    insert into public.finance_operation_receipts(id,tenant_id,company_id,actor_id,operation_id,
      aggregate_kind,aggregate_id,expected_version,committed_version,payload_hash,sanitized_result)
    values(v_receipt,'94700000-0000-4000-8000-000000000011','94700000-0000-4000-8000-000000000021',
      '94700000-0000-4000-8000-000000000003',v_operation,'invoice',v_source,0,1,
      pg_catalog.lpad(pg_catalog.to_hex(v_index),64,'0'),'{}');
    insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
    values(v_journal,'94700000-0000-4000-8000-000000000011','94700000-0000-4000-8000-000000000021',
      v_receipt,'invoice',v_source,'AED','2024-01-15 08:00:00+00');
    insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,credit_minor,currency) values
      (v_journal,1,'receivable',1,0,'AED'),(v_journal,2,'service_revenue',0,1,'AED');
    perform private.p309_post_journal(v_journal);
  end loop;
  v_page_one:=public.p309_export_finance_page('94700000-0000-4000-8000-000000000003',null,null,
    '2024-01-01 00:00:00+00','2024-02-01 00:00:00+00',null,'AED','invoice',null,null,10000);
  v_cursor:=v_page_one->'nextCursor';
  v_page_two:=public.p309_export_finance_page('94700000-0000-4000-8000-000000000003',null,null,
    '2024-01-01 00:00:00+00','2024-02-01 00:00:00+00',null,'AED','invoice',
    (v_cursor->>'occurredAt')::timestamptz,(v_cursor->>'id')::uuid,10000);
  if pg_catalog.jsonb_array_length(v_page_one->'rows')<>1000
    or pg_catalog.jsonb_array_length(v_page_two->'rows')<>5
    or v_page_one->'nextCursor' = 'null'::jsonb or v_page_two->'nextCursor' <> 'null'::jsonb
    or (v_page_one->'rows'->0) ? 'description'
  then raise exception 'BOUNDED_STABLE_EXPORT_FAILED'; end if;
end;
$p309_report_behavior$;

do $p309_finance_report_contract$
declare v_definition text;
begin
  if to_regclass('public.subscription_status_history') is null then
    raise exception 'subscription history missing';
  end if;
  if to_regclass('public.finance_receipt_snapshots') is null
    or not exists(select 1 from pg_trigger where tgname='finance_receipt_snapshots_immutable' and not tgisinternal)
  then raise exception 'immutable receipt snapshots missing'; end if;
  if not exists(select 1 from pg_trigger where tgname='subscriptions_p309_history' and not tgisinternal) then
    raise exception 'subscription history trigger missing';
  end if;
  foreach v_definition in array array[
    pg_get_functiondef('public.p309_finance_report(uuid,uuid,uuid,uuid,timestamptz,timestamptz)'::regprocedure),
    pg_get_functiondef('public.p309_subscription_report(uuid,timestamptz,timestamptz)'::regprocedure),
    pg_get_functiondef('public.p309_export_finance_page(uuid,uuid,uuid,timestamptz,timestamptz,uuid,text,text,timestamptz,uuid,integer)'::regprocedure),
    pg_get_functiondef('public.p309_generate_finance_receipt(uuid,uuid,uuid,text,uuid,text,uuid)'::regprocedure)
  ] loop
    if v_definition not like '%SECURITY DEFINER%' or v_definition not like '%SET search_path TO %' then
      raise exception 'finance report function is not hardened';
    end if;
  end loop;
  v_definition:=pg_get_functiondef('public.p309_finance_report(uuid,uuid,uuid,uuid,timestamptz,timestamptz)'::regprocedure);
  if v_definition not like '%accounting_at >= p_start_at%'
    or v_definition not like '%journal.accounting_at < p_end_at%'
    or v_definition not like $$%account_code='subscription_revenue' and source_kind='subscription_invoice'%$$
    or v_definition like '%invoice.status =%'
  then raise exception 'journal accounting period contract missing'; end if;
  v_definition:=pg_get_functiondef('public.p309_subscription_report(uuid,timestamptz,timestamptz)'::regprocedure);
  if v_definition not like $$%'churnRate'%$$
    or v_definition not like $$%'mrrAnnualRemainderMinor'%$$
    or v_definition like $$%'mrrRemainder'%$$
    or pg_catalog.lower(v_definition) not like '%group by start_population.currency%'
  then raise exception 'currency-separated subscription metrics missing'; end if;
  v_definition:=pg_get_functiondef('public.p309_export_finance_page(uuid,uuid,uuid,timestamptz,timestamptz,uuid,text,text,timestamptz,uuid,integer)'::regprocedure);
  if pg_catalog.lower(v_definition) not like '%least(1000%'
    or pg_catalog.lower(v_definition) not like '%accounting_at desc%id desc%'
    or v_definition not like '%allocation.payment_id%'
    or v_definition like '%journal.source_kind description%'
  then raise exception 'bounded keyset export contract missing'; end if;
  if has_function_privilege('anon','public.p309_finance_report(uuid,uuid,uuid,uuid,timestamptz,timestamptz)','EXECUTE')
    or has_function_privilege('authenticated','public.p309_generate_finance_receipt(uuid,uuid,uuid,text,uuid,text,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.p309_export_finance_page(uuid,uuid,uuid,timestamptz,timestamptz,uuid,text,text,timestamptz,uuid,integer)','EXECUTE')
  then raise exception 'finance report grants invalid'; end if;
end;
$p309_finance_report_contract$;

rollback;
