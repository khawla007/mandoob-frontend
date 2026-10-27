\set ON_ERROR_STOP on
set statement_timeout = '30s';
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('94900000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p309-command-admin@example.invalid','synthetic',now(),'{}','{}',now(),now()),
  ('94900000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p309-command-pro@example.invalid','synthetic',now(),'{}','{}',now(),now()),
  ('94900000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p309-command-customer@example.invalid','synthetic',now(),'{}','{}',now(),now()),
  ('94900000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p309-command-foreign-customer@example.invalid','synthetic',now(),'{}','{}',now(),now());
insert into public.profiles (id,role,status,full_name) values
  ('94900000-0000-4000-8000-000000000001','admin','active','P309 Command Admin');
insert into public.tenants (id,slug,name,status) values
  ('94900000-0000-4000-8000-000000000010','p309-command-one','P309 Command One','active'),
  ('94900000-0000-4000-8000-000000000011','p309-command-two','P309 Command Two','active');
insert into public.company_profiles (id,tenant_id,company_name) values
  ('94900000-0000-4000-8000-000000000020','94900000-0000-4000-8000-000000000010','P309 Command Company'),
  ('94900000-0000-4000-8000-000000000021','94900000-0000-4000-8000-000000000011','Foreign Company');
insert into public.profiles (id,tenant_id,role,status,full_name) values
  ('94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000010','pro','active','P309 Command PRO'),
  ('94900000-0000-4000-8000-000000000003','94900000-0000-4000-8000-000000000010','customer','active','P309 Command Customer'),
  ('94900000-0000-4000-8000-000000000004','94900000-0000-4000-8000-000000000011','customer','active','Foreign Customer');
insert into public.pro_profiles (profile_id) values ('94900000-0000-4000-8000-000000000002');
insert into public.customer_profiles (profile_id,linked_company_id)
values
  ('94900000-0000-4000-8000-000000000003','94900000-0000-4000-8000-000000000020'),
  ('94900000-0000-4000-8000-000000000004','94900000-0000-4000-8000-000000000021');
insert into public.pro_company_assignments
  (id,tenant_id,company_id,pro_profile_id,assigned_at,assigned_by) values
  ('94900000-0000-4000-8000-000000000030','94900000-0000-4000-8000-000000000010',
   '94900000-0000-4000-8000-000000000020','94900000-0000-4000-8000-000000000002',now(),
   '94900000-0000-4000-8000-000000000001');

do $p309_legacy_execute_revoked$
begin
  if pg_catalog.has_function_privilege('service_role',
    'public.create_company_invoice(uuid,uuid,uuid,text,text,text,bigint,text,date,uuid)','EXECUTE')
    or pg_catalog.has_function_privilege('service_role',
      'public.reconcile_company_refund(uuid,uuid,uuid,uuid,text,text,text)','EXECUTE')
  then raise exception 'LEGACY_FINANCE_RPC_STILL_EXECUTABLE'; end if;
  if not pg_catalog.has_function_privilege('service_role',
    'public.p309_reconcile_pending_refund(uuid,text,text)','EXECUTE')
  then raise exception 'P309_RECOVERY_RPC_NOT_EXECUTABLE'; end if;
  if pg_catalog.to_regprocedure(
    'public.p309_reconcile_refund(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,text,text,boolean)'
  ) is not null then raise exception 'PUBLIC_RECOVERY_BYPASS_EXPOSED'; end if;
  if pg_catalog.has_function_privilege('service_role',
    'private.p309_reconcile_refund_core(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,text,text,boolean)',
    'EXECUTE') then raise exception 'PRIVATE_RECOVERY_CORE_EXECUTABLE'; end if;
end;
$p309_legacy_execute_revoked$;

do $p309_command_lifecycle$
declare
  v_draft jsonb; v_replay jsonb; v_invoice uuid; v_first_payment uuid; v_second_payment uuid;
  v_refund_one uuid; v_refund_two uuid; v_refund_three uuid; v_void_invoice uuid; v_result jsonb;
  v_vat_invoice uuid; v_vat_payment uuid; v_vat_refund_one uuid; v_vat_refund_two uuid;
begin
  begin
    perform public.p309_create_invoice_draft(
      '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
      '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000100',0,repeat('0',64),
      '94900000-0000-4000-8000-000000000004','Cross-customer invoice',current_date+7,
      '[{"description":"Cross customer","quantity":1,"unitAmountMinor":100,"discountMinor":0,"taxCategory":"zero_rated","taxBasis":"zero_rated","vatBasisPoints":0,"currency":"USD"}]'::jsonb);
    raise exception 'CROSS_CUSTOMER_DRAFT_ACCEPTED';
  exception when insufficient_privilege then null; end;
  v_draft:=public.p309_create_invoice_draft(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000101',0,repeat('a',64),
    '94900000-0000-4000-8000-000000000003','Lifecycle invoice',current_date+7,
    '[{"description":"Lifecycle line","quantity":1,"unitAmountMinor":1000,"discountMinor":0,"taxCategory":"zero_rated","taxBasis":"zero_rated","vatBasisPoints":0,"currency":"USD"}]'::jsonb);
  v_invoice:=(v_draft->>'invoiceId')::uuid;
  if (v_draft->>'version')::bigint<>1 or not exists (
    select 1 from public.invoices where id=v_invoice and currency='USD' and amount_minor=1000 and status='draft'
  ) then raise exception 'DRAFT_COMMAND_FAILED'; end if;
  v_result:=public.p309_list_customer_invoices(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000003',null,null,25,'all',current_date,null);
  if (v_result->>'total')::bigint<>0 then raise exception 'CUSTOMER_DRAFT_DISCLOSED'; end if;

  v_replay:=public.p309_create_invoice_draft(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000101',0,repeat('a',64),
    '94900000-0000-4000-8000-000000000003','Lifecycle invoice',current_date+7,
    '[{"description":"Lifecycle line","quantity":1,"unitAmountMinor":1000,"discountMinor":0,"taxCategory":"zero_rated","taxBasis":"zero_rated","vatBasisPoints":0,"currency":"USD"}]'::jsonb);
  if (v_replay->>'invoiceId')::uuid<>v_invoice or (v_replay->>'replayed')::boolean is not true
  then raise exception 'DRAFT_REPLAY_NOT_EXACT'; end if;
  begin
    perform public.p309_create_invoice_draft(
      '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
      '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000101',0,repeat('b',64),
      null,'Reused',null,'[{"description":"x","quantity":1,"unitAmountMinor":1,"discountMinor":0,"taxCategory":"zero_rated","taxBasis":"zero_rated","vatBasisPoints":0,"currency":"USD"}]'::jsonb);
    raise exception 'OPERATION_REUSE_ACCEPTED';
  exception when unique_violation then
    if sqlerrm<>'OPERATION_REUSED' then raise; end if;
  end;
  begin
    perform public.p309_finalize_invoice(
      '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000021',
      '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000102',1,repeat('c',64),v_invoice);
    raise exception 'FOREIGN_COMPANY_COMMAND_ACCEPTED';
  exception when insufficient_privilege then null; end;

  v_result:=public.p309_finalize_invoice(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000103',1,repeat('d',64),v_invoice);
  begin
    perform public.p309_allocate_manual_payment(
      '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
      '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000104',1,repeat('e',64),
      v_invoice,1,'cash',null);
    raise exception 'STALE_VERSION_ACCEPTED';
  exception when serialization_failure then null; end;
  v_result:=public.p309_allocate_manual_payment(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000105',2,repeat('f',64),
    v_invoice,400,'cash','partial one');
  v_first_payment:=(v_result->>'paymentId')::uuid;
  v_result:=public.p309_allocate_manual_payment(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000106',3,repeat('1',64),
    v_invoice,600,'bank_transfer','partial two');
  v_second_payment:=(v_result->>'paymentId')::uuid;

  v_result:=public.p309_prepare_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000107',4,repeat('2',64),
    v_invoice,v_first_payment,300,'partial refund');
  v_refund_one:=(v_result->>'refundId')::uuid;
  v_replay:=public.p309_prepare_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000107',5,repeat('2',64),
    v_invoice,v_first_payment,300,'partial refund');
  if (v_replay->>'refundId')::uuid<>v_refund_one or (v_replay->>'replayed')::boolean is not true
  then raise exception 'REFUND_RESERVATION_REPLAY_NOT_EXACT'; end if;
  begin
    perform public.p309_prepare_refund(
      '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
      '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000108',5,repeat('3',64),
      v_invoice,v_first_payment,101,'reserved capture');
    raise exception 'PENDING_REFUND_NOT_RESERVED';
  exception when check_violation then
    if sqlerrm<>'REFUND_EXCEEDS_CAPTURE' then raise; end if;
  end;
  v_result:=public.p309_attach_pending_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000109',5,repeat('4',64),
    v_invoice,v_first_payment,v_refund_one,'tap-refund-fixture');
  if (v_result->>'status')<>'pending' or not exists(select 1 from public.refunds
    where id=v_refund_one and status='pending' and provider_refund_id='tap-refund-fixture')
  then raise exception 'PENDING_PROVIDER_REFUND_NOT_ATTACHED'; end if;
  update public.pro_company_assignments set status='released',released_at=now(),
    released_by='94900000-0000-4000-8000-000000000001',release_reason='Recovery authorization proof'
    where id='94900000-0000-4000-8000-000000000030';
  update public.profiles set status='suspended' where id='94900000-0000-4000-8000-000000000002';
  perform pg_catalog.set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.p309_reconcile_pending_refund(v_refund_one,'tap-refund-fixture','succeeded');
  if not exists(select 1 from public.invoices where id=v_invoice and status='partially_refunded')
  then raise exception 'INVOICE_WIDE_PARTIAL_STATUS_FAILED'; end if;
  update public.profiles set status='active' where id='94900000-0000-4000-8000-000000000002';
  update public.pro_company_assignments set status='active',released_at=null,released_by=null,release_reason=null
    where id='94900000-0000-4000-8000-000000000030';

  v_result:=public.p309_prepare_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000110',7,repeat('5',64),
    v_invoice,v_second_payment,600,'second payment refund');
  v_refund_two:=(v_result->>'refundId')::uuid;
  perform public.p309_reconcile_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000111',8,repeat('6',64),
    v_invoice,v_second_payment,v_refund_two,null,'succeeded');
  if not exists(select 1 from public.invoices where id=v_invoice and status='partially_refunded')
  then raise exception 'SELECTED_PAYMENT_STATUS_LEAKED_TO_INVOICE'; end if;
  v_result:=public.p309_prepare_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000112',9,repeat('7',64),
    v_invoice,v_first_payment,100,'final refund');
  v_refund_three:=(v_result->>'refundId')::uuid;
  perform public.p309_reconcile_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000113',10,repeat('8',64),
    v_invoice,v_first_payment,v_refund_three,null,'succeeded');
  if not exists(select 1 from public.invoices where id=v_invoice and status='refunded' and version=11)
  then raise exception 'FULL_REFUND_STATUS_FAILED'; end if;
  v_result:=public.p309_create_invoice_draft(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000114',0,repeat('9',64),
    '94900000-0000-4000-8000-000000000003','Void lifecycle invoice',current_date+7,
    '[{"description":"Void line","quantity":1,"unitAmountMinor":100,"discountMinor":0,"taxCategory":"zero_rated","taxBasis":"zero_rated","vatBasisPoints":0,"currency":"USD"}]'::jsonb);
  v_void_invoice:=(v_result->>'invoiceId')::uuid;
  perform public.p309_finalize_invoice(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000115',1,repeat('a',64),v_void_invoice);
  perform public.p309_void_invoice(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000116',2,repeat('b',64),v_void_invoice,'Fixture void');
  if not exists(select 1 from public.invoices where id=v_void_invoice and status='void' and version=3)
  then raise exception 'VOID_COMMAND_FAILED'; end if;

  v_result:=public.p309_create_invoice_draft(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000120',0,repeat('c',64),
    '94900000-0000-4000-8000-000000000003','VAT refund invoice',current_date+7,
    '[{"description":"VAT inclusive","quantity":1,"unitAmountMinor":100,"discountMinor":0,"taxCategory":"standard","taxBasis":"inclusive","vatBasisPoints":500,"currency":"AED"}]'::jsonb);
  v_vat_invoice:=(v_result->>'invoiceId')::uuid;
  perform public.p309_finalize_invoice(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000121',1,repeat('d',64),v_vat_invoice);
  v_result:=public.p309_allocate_manual_payment(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000122',2,repeat('e',64),
    v_vat_invoice,100,'cash','VAT capture');
  v_vat_payment:=(v_result->>'paymentId')::uuid;
  v_result:=public.p309_prepare_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000123',3,repeat('f',64),
    v_vat_invoice,v_vat_payment,33,'VAT partial one');
  v_vat_refund_one:=(v_result->>'refundId')::uuid;
  perform public.p309_reconcile_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000124',4,repeat('0',64),
    v_vat_invoice,v_vat_payment,v_vat_refund_one,null,'succeeded');
  v_result:=public.p309_prepare_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000125',5,repeat('1',64),
    v_vat_invoice,v_vat_payment,67,'VAT partial two');
  v_vat_refund_two:=(v_result->>'refundId')::uuid;
  perform public.p309_reconcile_refund(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000126',6,repeat('2',64),
    v_vat_invoice,v_vat_payment,v_vat_refund_two,null,'succeeded');
  if (select coalesce(sum(entry.debit_minor),0) from public.finance_journals journal
      join public.finance_journal_entries entry on entry.journal_id=journal.id
      join public.finance_credit_notes note on note.id=journal.source_id and note.invoice_id=v_vat_invoice
      where journal.source_kind='credit_note' and entry.account_code='refund_contra_revenue')<>95
    or (select coalesce(sum(entry.debit_minor),0) from public.finance_journals journal
      join public.finance_journal_entries entry on entry.journal_id=journal.id
      join public.finance_credit_notes note on note.id=journal.source_id and note.invoice_id=v_vat_invoice
      where journal.source_kind='credit_note' and entry.account_code='vat_payable')<>5
    or (select coalesce(sum(entry.credit_minor),0) from public.finance_journals journal
      join public.finance_journal_entries entry on entry.journal_id=journal.id
      join public.finance_credit_notes note on note.id=journal.source_id and note.invoice_id=v_vat_invoice
      where journal.source_kind='credit_note' and entry.account_code='receivable')<>100
    or (select coalesce(sum(entry.debit_minor),0) from public.finance_journals journal
      join public.finance_journal_entries entry on entry.journal_id=journal.id
      where journal.source_kind='cash_refund' and journal.source_id in (v_vat_refund_one,v_vat_refund_two)
        and entry.account_code='receivable')<>100
    or (select coalesce(sum(entry.credit_minor),0) from public.finance_journals journal
      join public.finance_journal_entries entry on entry.journal_id=journal.id
      where journal.source_kind='cash_refund' and journal.source_id in (v_vat_refund_one,v_vat_refund_two)
        and entry.account_code='cash_clearing')<>100
  then raise exception 'CUMULATIVE_REFUND_VAT_SPLIT_FAILED'; end if;
  if (select count(*) from public.finance_audit_log where resource_id in (v_invoice,v_first_payment,v_second_payment,v_refund_one,v_refund_two,v_refund_three))<10
    or (select count(*) from public.domain_events where payload->>'invoice_id'=v_invoice::text or payload->>'resource_id'=v_invoice::text)<10
    or (select count(*) from public.finance_journals where company_id='94900000-0000-4000-8000-000000000020' and state='posted')<>17
  then raise exception 'COMMAND_EVIDENCE_INCOMPLETE'; end if;
  v_result:=public.p309_list_company_invoices(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000002',null,null,25,'all',current_date,null,null);
  if (v_result->>'total')::bigint<>3 or pg_catalog.jsonb_array_length(v_result->'rows')<>3
  then raise exception 'COMPANY_KEYSET_COUNT_FAILED'; end if;
  v_result:=public.p309_list_customer_invoices(
    '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
    '94900000-0000-4000-8000-000000000003',null,null,25,'all',current_date,null);
  if (v_result->>'total')::bigint<>3 or pg_catalog.jsonb_array_length(v_result->'rows')<>3
  then raise exception 'CUSTOMER_KEYSET_COUNT_FAILED'; end if;
  update public.pro_company_assignments set status='released',released_at=now(),
    released_by='94900000-0000-4000-8000-000000000001',release_reason='Test suspension'
    where id='94900000-0000-4000-8000-000000000030';
  update public.profiles set status='suspended' where id='94900000-0000-4000-8000-000000000002';
  begin
    perform public.p309_list_company_invoices(
      '94900000-0000-4000-8000-000000000010','94900000-0000-4000-8000-000000000020',
      '94900000-0000-4000-8000-000000000002',null,null,25,'all',current_date,null,null);
    raise exception 'INACTIVE_PRO_AUTHORIZED';
  exception when insufficient_privilege then null; end;
end;
$p309_command_lifecycle$;

rollback;
