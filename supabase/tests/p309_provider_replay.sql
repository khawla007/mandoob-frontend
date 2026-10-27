-- Run after migrations through 20260922093000. The harness repairs/baselines
-- historical migration 0087; this rollback-only fixture never patches it.
\set ON_ERROR_STOP on
set statement_timeout='30s';
begin;
create function pg_temp.check(p_ok boolean,p_code text) returns void language plpgsql as $$
begin if not coalesce(p_ok,false) then raise exception '%',p_code; end if; end; $$;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('94800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','provider-admin@example.invalid','synthetic',now(),'{}','{}',now(),now()),
 ('94800000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','provider-pro@example.invalid','synthetic',now(),'{}','{}',now(),now()),
 ('94800000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','provider-customer@example.invalid','synthetic',now(),'{}','{}',now(),now());
insert into public.profiles(id,role,status,full_name) values('94800000-0000-4000-8000-000000000001','admin','active','Provider Admin');
insert into public.tenants(id,slug,name,status) values('94800000-0000-4000-8000-000000000010','p309-provider','Provider Tenant','active');
insert into public.company_profiles(id,tenant_id,company_name) values('94800000-0000-4000-8000-000000000020','94800000-0000-4000-8000-000000000010','Provider Company');
insert into public.profiles(id,tenant_id,role,status,full_name) values
 ('94800000-0000-4000-8000-000000000002','94800000-0000-4000-8000-000000000010','pro','active','Provider PRO'),
 ('94800000-0000-4000-8000-000000000003','94800000-0000-4000-8000-000000000010','customer','active','Provider Customer');
insert into public.pro_profiles(profile_id) values('94800000-0000-4000-8000-000000000002');
insert into public.customer_profiles(profile_id,linked_company_id) values('94800000-0000-4000-8000-000000000003','94800000-0000-4000-8000-000000000020');
insert into public.pro_company_assignments(id,tenant_id,company_id,pro_profile_id,assigned_at,assigned_by) values
 ('94800000-0000-4000-8000-000000000030','94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020','94800000-0000-4000-8000-000000000002',now(),'94800000-0000-4000-8000-000000000001');
insert into public.tenant_payment_config(tenant_id,provider,merchant_id,secret_encrypted,webhook_secret_encrypted,enabled) values
 ('94800000-0000-4000-8000-000000000010','tap','acct-provider','ciphertext','webhook-ciphertext',true);
insert into public.tap_provider_destinations(id,tenant_id,company_id,account_id,destination_hash) values
 ('94800000-0000-4000-8000-000000000040','94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020','acct-provider',repeat('d',64));

do $provider_replay$
declare draft jsonb; result jsonb; replay jsonb; invoice_id uuid; attempt_id uuid; payment_id uuid;
  effect_token uuid; event_result jsonb; journals bigint; refund_id uuid; refund_claim public.refunds%rowtype;
  void_invoice uuid; void_attempt uuid; void_token uuid; compensation_claim public.payment_provider_attempts%rowtype;
  event_claim public.tap_provider_events%rowtype; original_event_token uuid;
begin
  draft:=public.p309_create_invoice_draft('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000002','94800000-0000-4000-8000-000000000101',0,repeat('a',64),
    '94800000-0000-4000-8000-000000000003','Provider invoice',current_date+7,
    '[{"description":"Collectible","quantity":1,"unitAmountMinor":1000,"discountMinor":0,"taxCategory":"zero_rated","taxBasis":"zero_rated","vatBasisPoints":0,"currency":"AED"}]'::jsonb);
  invoice_id:=(draft->>'invoiceId')::uuid;
  perform public.p309_finalize_invoice('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000002','94800000-0000-4000-8000-000000000102',1,repeat('b',64),invoice_id);
  perform public.p309_allocate_manual_payment('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000002','94800000-0000-4000-8000-000000000103',2,repeat('c',64),invoice_id,400,'cash','partial');
  perform pg_catalog.set_config('request.jwt.claims','{"role":"service_role"}',true);
  result:=public.p309_reserve_payment_attempt('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000003',invoice_id,'94800000-0000-4000-8000-000000000104',3,repeat('e',64),'94800000-0000-4000-8000-000000000040');
  attempt_id:=(result->>'attemptId')::uuid; payment_id:=(result->>'paymentId')::uuid; effect_token:=(result->>'effectToken')::uuid;
  perform pg_temp.check((result->>'amountMinor')::bigint=600 and result->>'currency'='AED','RESERVATION_RECEIPT_NOT_AUTHORITATIVE');
  perform pg_temp.check((select amount_minor=600 from public.payment_provider_attempts where id=attempt_id),'OUTSTANDING_NOT_AUTHORITATIVE');
  replay:=public.p309_reserve_payment_attempt('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000003',invoice_id,'94800000-0000-4000-8000-000000000104',3,repeat('e',64),'94800000-0000-4000-8000-000000000040');
  perform pg_temp.check((replay->>'attemptId')::uuid=attempt_id and not (replay->>'ownsEffect')::boolean,'DUPLICATE_EFFECT_OWNER');
  begin
    perform public.p309_reserve_payment_attempt('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
      '94800000-0000-4000-8000-000000000003',invoice_id,'94800000-0000-4000-8000-000000000104',3,repeat('f',64),'94800000-0000-4000-8000-000000000040');
    raise exception 'CHANGED_PAYLOAD_ACCEPTED'; exception when unique_violation then null;
  end;
  begin
    perform public.p309_reserve_payment_attempt('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
      '94800000-0000-4000-8000-000000000003',invoice_id,'94800000-0000-4000-8000-000000000104',4,repeat('e',64),'94800000-0000-4000-8000-000000000040');
    raise exception 'CHANGED_EXPECTED_VERSION_ACCEPTED'; exception when unique_violation then null;
  end;
  perform public.p309_attach_payment_attempt(attempt_id,result->>'effectKey',effect_token,'charge-fixture','https://provider.invalid/charge');
  select count(*) into journals from public.finance_journals where source_kind='payment_allocation';
  event_result:=public.p309_reserve_tap_event('94800000-0000-4000-8000-000000000040','event-bad-amount',repeat('6',64),'charge-fixture',601,'AED','CAPTURED','2026-01-01T09:55:00Z');
  perform pg_temp.check((public.p309_reconcile_tap_event((event_result->>'eventId')::uuid,(event_result->>'token')::uuid)->>'outcome')='mismatch',
    'MISMATCHED_AMOUNT_ACCEPTED');
  event_result:=public.p309_reserve_tap_event('94800000-0000-4000-8000-000000000040','event-bad-currency',repeat('7',64),'charge-fixture',600,'USD','CAPTURED','2026-01-01T09:56:00Z');
  perform pg_temp.check((public.p309_reconcile_tap_event((event_result->>'eventId')::uuid,(event_result->>'token')::uuid)->>'outcome')='mismatch',
    'MISMATCHED_CURRENCY_ACCEPTED');
  event_result:=public.p309_reserve_tap_event('94800000-0000-4000-8000-000000000040','event-bad-charge',repeat('8',64),'charge-other',600,'AED','CAPTURED','2026-01-01T09:57:00Z');
  perform pg_temp.check((public.p309_reconcile_tap_event((event_result->>'eventId')::uuid,(event_result->>'token')::uuid)->>'outcome')='mismatch','MISMATCHED_CHARGE_ACCEPTED');
  event_result:=public.p309_reserve_tap_event('94800000-0000-4000-8000-000000000040','event-failed',repeat('1',64),'charge-fixture',600,'AED','FAILED','2026-01-01T10:00:00Z');
  original_event_token:=(event_result->>'token')::uuid;
  select * into event_claim from public.p309_claim_tap_event_recovery('94800000-0000-4000-8000-000000000206',1,60);
  perform pg_temp.check(event_claim.id=(event_result->>'eventId')::uuid,'STRANDED_EVENT_NOT_CLAIMED');
  perform pg_temp.check((public.p309_reconcile_tap_event(event_claim.id,original_event_token)->>'outcome')='fenced',
    'STALE_EVENT_WORKER_RECONCILED');
  perform public.p309_reconcile_tap_event(event_claim.id,event_claim.fence_token);
  perform pg_temp.check((select state='failed' from public.payment_provider_attempts where id=attempt_id),'FAILURE_NOT_TERMINAL');
  perform pg_temp.check((select count(*) from public.finance_journals where source_kind='payment_allocation')=journals,'FAILURE_POSTED_JOURNAL');
  event_result:=public.p309_reserve_tap_event('94800000-0000-4000-8000-000000000040','event-captured',repeat('2',64),'charge-fixture',600,'AED','CAPTURED','2026-01-01T10:01:00Z');
  perform public.p309_reconcile_tap_event((event_result->>'eventId')::uuid,(event_result->>'token')::uuid);
  perform pg_temp.check((select state='succeeded' from public.payment_provider_attempts where id=attempt_id),'LATER_CAPTURE_BLOCKED');
  event_result:=public.p309_reserve_tap_event('94800000-0000-4000-8000-000000000040','event-stale',repeat('3',64),'charge-fixture',600,'AED','DECLINED','2026-01-01T09:59:00Z');
  perform pg_temp.check((public.p309_reconcile_tap_event((event_result->>'eventId')::uuid,(event_result->>'token')::uuid)->>'outcome')='stale','STALE_EVENT_APPLIED');
  replay:=public.p309_reserve_tap_event('94800000-0000-4000-8000-000000000040','event-captured',repeat('2',64),'charge-fixture',600,'AED','CAPTURED','2026-01-01T10:01:00Z');
  perform pg_temp.check(not (replay->>'reserved')::boolean,'APPLIED_EVENT_RECLAIMED');

  draft:=public.p309_create_invoice_draft('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000002','94800000-0000-4000-8000-000000000110',0,repeat('9',64),
    '94800000-0000-4000-8000-000000000003','Void race',current_date+7,
    '[{"description":"Void race","quantity":1,"unitAmountMinor":250,"discountMinor":0,"taxCategory":"zero_rated","taxBasis":"zero_rated","vatBasisPoints":0,"currency":"AED"}]'::jsonb);
  void_invoice:=(draft->>'invoiceId')::uuid;
  perform public.p309_finalize_invoice('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000002','94800000-0000-4000-8000-000000000111',1,repeat('a',64),void_invoice);
  result:=public.p309_reserve_payment_attempt('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000003',void_invoice,'94800000-0000-4000-8000-000000000112',2,repeat('b',64),'94800000-0000-4000-8000-000000000040');
  void_attempt:=(result->>'attemptId')::uuid; void_token:=(result->>'effectToken')::uuid;
  perform public.p309_attach_payment_attempt(void_attempt,result->>'effectKey',void_token,'charge-void-race','https://provider.invalid/void');
  perform public.p309_void_invoice('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000002','94800000-0000-4000-8000-000000000113',2,repeat('c',64),void_invoice,'cancelled before capture');
  event_result:=public.p309_reserve_tap_event('94800000-0000-4000-8000-000000000040','event-void-race',repeat('d',64),'charge-void-race',250,'AED','CAPTURED','2026-01-01T11:00:00Z');
  perform public.p309_reconcile_tap_event((event_result->>'eventId')::uuid,(event_result->>'token')::uuid);
  perform pg_temp.check((select status='void' from public.invoices where id=void_invoice)
    and not exists(select 1 from public.payment_allocations pa where pa.invoice_id=void_invoice),'VOID_RACE_POSTED_PAYMENT');
  perform pg_temp.check((select state='compensation_required' and compensation_effect_key is not null
    from public.payment_provider_attempts where id=void_attempt),'VOID_CAPTURE_NOT_COMPENSATABLE');
  perform pg_temp.check((select state='compensation_required' from public.tap_provider_events
    where id=(event_result->>'eventId')::uuid),'VOID_CAPTURE_EVENT_DISPOSITION_MISSING');
  select * into compensation_claim from public.p309_claim_tap_compensation('94800000-0000-4000-8000-000000000203',1,60);
  perform pg_temp.check(compensation_claim.id=void_attempt,'VOID_CAPTURE_NOT_COMPENSATABLE');
  perform pg_temp.check(not exists(select 1 from public.p309_claim_tap_compensation('94800000-0000-4000-8000-000000000204',1,60)),
    'COMPENSATION_DOUBLE_CLAIMED');
  perform public.p309_attach_tap_compensation(void_attempt,'94800000-0000-4000-8000-000000000203',compensation_claim.lease_token,
    compensation_claim.compensation_effect_key,'refund-void-race');
  begin
    perform public.p309_reconcile_tap_compensation(void_attempt,'94800000-0000-4000-8000-000000000204',compensation_claim.lease_token,
      'refund-void-race','succeeded');
    raise exception 'STALE_COMPENSATION_FENCE_RECONCILED'; exception when check_violation then null;
  end;
  perform public.p309_reconcile_tap_compensation(void_attempt,'94800000-0000-4000-8000-000000000203',compensation_claim.lease_token,
    'refund-void-race','succeeded');
  perform pg_temp.check((select state='compensated' from public.payment_provider_attempts where id=void_attempt)
    and not exists(select 1 from public.p309_claim_tap_compensation('94800000-0000-4000-8000-000000000204',1,60)),
    'COMPENSATION_NOT_TERMINAL');

  result:=public.p309_prepare_refund('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000002','94800000-0000-4000-8000-000000000105',4,repeat('4',64),invoice_id,payment_id,100,'provider refund');
  refund_id:=(result->>'refundId')::uuid;
  replay:=public.p309_reserve_refund_effect(refund_id,result->>'providerIdempotencyKey',repeat('5',64),
    '94800000-0000-4000-8000-000000000205');
  perform pg_temp.check((replay->>'ownsEffect')::boolean,'REFUND_EFFECT_NOT_OWNED');
  perform public.p309_complete_tap_refund_recovery(refund_id,'94800000-0000-4000-8000-000000000205',(replay->>'leaseToken')::uuid);
  select * into refund_claim from public.p309_claim_tap_refund_recovery('94800000-0000-4000-8000-000000000201',1,60);
  perform pg_temp.check(refund_claim.id=refund_id,'REFUND_NOT_CLAIMED');
  perform pg_temp.check(not exists(select 1 from public.p309_claim_tap_refund_recovery('94800000-0000-4000-8000-000000000202',1,60)),'REFUND_DOUBLE_CLAIMED');
  begin
    perform public.p309_attach_refund_effect_recovery(refund_id,result->>'providerIdempotencyKey','refund-fixture',
      '94800000-0000-4000-8000-000000000202',refund_claim.recovery_lease_token);
    raise exception 'STALE_REFUND_WORKER_MUTATED'; exception when check_violation then null;
  end;
  perform public.p309_attach_refund_effect_recovery(refund_id,result->>'providerIdempotencyKey','refund-fixture',
    '94800000-0000-4000-8000-000000000201',refund_claim.recovery_lease_token);
  begin
    perform public.p309_reconcile_claimed_refund(refund_id,'refund-fixture','failed','94800000-0000-4000-8000-000000000202',refund_claim.recovery_lease_token);
    raise exception 'STALE_REFUND_FENCE_RECONCILED'; exception when check_violation then null;
  end;
  select count(*) into journals from public.finance_journals;
  perform public.p309_reconcile_claimed_refund(refund_id,'refund-fixture','failed','94800000-0000-4000-8000-000000000201',refund_claim.recovery_lease_token);
  perform pg_temp.check((select count(*) from public.finance_journals)=journals,'REFUND_FAILURE_POSTED_JOURNAL');
  replay:=public.p309_get_refund_result(refund_id);
  perform pg_temp.check(replay->>'status'='failed' and (replay->>'partial')::boolean
    and (replay->>'version')::bigint=(select version from public.invoices where id=invoice_id),
    'REFUND_DURABLE_RESULT_MISMATCH');
  result:=public.p309_prepare_refund('94800000-0000-4000-8000-000000000010','94800000-0000-4000-8000-000000000020',
    '94800000-0000-4000-8000-000000000002','94800000-0000-4000-8000-000000000106',6,repeat('7',64),invoice_id,payment_id,100,'terminal provider rejection');
  refund_id:=(result->>'refundId')::uuid;
  replay:=public.p309_reserve_refund_effect(refund_id,result->>'providerIdempotencyKey',repeat('8',64),
    '94800000-0000-4000-8000-000000000207');
  select count(*) into journals from public.finance_journals;
  perform public.p309_reconcile_claimed_refund(refund_id,null,'failed','94800000-0000-4000-8000-000000000207',(replay->>'leaseToken')::uuid);
  perform pg_temp.check((select status='failed' from public.refunds where id=refund_id)
    and not exists(select 1 from public.p309_claim_tap_refund_recovery('94800000-0000-4000-8000-000000000208',1,60))
    and (select count(*) from public.finance_journals)=journals,'TERMINAL_CREATE_FAILURE_NOT_RELEASED');
end;
$provider_replay$;
rollback;
