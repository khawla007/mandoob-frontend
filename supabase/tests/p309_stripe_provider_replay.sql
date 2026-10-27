-- Run after migrations through 20260922095000. Rollback-only Stripe replay/order fixture.
\set ON_ERROR_STOP on
set statement_timeout='30s';
begin;
create function pg_temp.check(p_ok boolean,p_code text) returns void language plpgsql as $$
begin if not coalesce(p_ok,false) then raise exception '%',p_code; end if; end; $$;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('95900000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'stripe-pro@example.invalid','synthetic',now(),'{}','{}',now(),now());
insert into public.tenants(id,slug,name,status) values
 ('95900000-0000-4000-8000-000000000010','p309-stripe','Stripe Tenant','active');
insert into public.profiles(id,tenant_id,role,status,full_name) values
 ('95900000-0000-4000-8000-000000000001','95900000-0000-4000-8000-000000000010','pro','active','Stripe PRO');
insert into public.company_profiles(id,tenant_id,company_name) values
 ('95900000-0000-4000-8000-000000000020','95900000-0000-4000-8000-000000000010','Stripe Company');
insert into public.pro_profiles(profile_id) values('95900000-0000-4000-8000-000000000001');
insert into public.pro_company_assignments(id,tenant_id,company_id,pro_profile_id,assigned_at,assigned_by) values
 ('95900000-0000-4000-8000-000000000030','95900000-0000-4000-8000-000000000010',
  '95900000-0000-4000-8000-000000000020','95900000-0000-4000-8000-000000000001',now(),
  '95900000-0000-4000-8000-000000000001');

do $fixture$
declare v_catalog uuid; v_intent jsonb; v_event jsonb; v_result jsonb; v_subscription uuid;
begin
  insert into public.subscription_catalog_versions(catalog_key,label,catalog_class,currency,state,review_reference)
  values('p309-stripe-fixture','Stripe fixture','commercial','AED','draft','P309-STRIPE-FIXTURE') returning id into v_catalog;
  insert into public.subscription_plan_prices values(v_catalog,'starter','monthly',19900);
  insert into public.subscription_plan_allowances values(v_catalog,'starter','employees',25),(v_catalog,'starter','storage_bytes',5368709120),
    (v_catalog,'starter','invoices',50),(v_catalog,'starter','sms',0),(v_catalog,'starter','whatsapp',0),(v_catalog,'starter','advanced_reports',0);
  insert into public.subscription_provider_price_mappings(catalog_version_id,provider,destination,plan_key,cadence,
    provider_price_id,currency,amount_minor,interval)
  values(v_catalog,'stripe','test','starter','monthly','price_fixture','AED',19900,'month');
  update public.subscription_catalog_versions set state='active',effective_from=now() where id=v_catalog;
  insert into public.subscription_provider_enablement(catalog_version_id,provider,destination,enabled,review_reference)
  values(v_catalog,'stripe','test',true,'P309-STRIPE-FIXTURE');

  v_intent:=public.p309_reserve_stripe_operation('95900000-0000-4000-8000-000000000010','95900000-0000-4000-8000-000000000020',
    '95900000-0000-4000-8000-000000000001','95900000-0000-4000-8000-000000000101','checkout','test',
    v_catalog,'starter','monthly',null,repeat('a',64));
  perform pg_temp.check(v_intent->>'providerPriceId'='price_fixture','PRICE_MAPPING_NOT_AUTHORITATIVE');
  perform public.p309_attach_stripe_operation('95900000-0000-4000-8000-000000000101',
    (v_intent->>'effectToken')::uuid,'cs_fixture','https://checkout.stripe.com/fixture');
  perform public.p309_bind_stripe_customer('95900000-0000-4000-8000-000000000101','cs_fixture','cus_fixture');
  perform pg_temp.check((public.p309_reserve_stripe_operation('95900000-0000-4000-8000-000000000010','95900000-0000-4000-8000-000000000020',
    '95900000-0000-4000-8000-000000000001','95900000-0000-4000-8000-000000000101','checkout','test',
    v_catalog,'starter','monthly',null,repeat('a',64))->>'replayed')::boolean,'OPERATION_REPLAY_MISSED');

  v_event:=public.p309_reserve_stripe_event('test','evt_fixture',repeat('b',64),100,'customer.subscription.created','cus_fixture','sub_fixture');
  v_result:=public.p309_apply_stripe_subscription_event((v_event->>'eventId')::uuid,'cus_fixture','sub_fixture','price_fixture',
    'active',now(),now()+interval '1 month',false,null,19900,'AED','month','95900000-0000-4000-8000-000000000010');
  perform pg_temp.check(v_result->>'state'='applied','EVENT_NOT_APPLIED');
  select id into v_subscription from public.subscriptions where tenant_id='95900000-0000-4000-8000-000000000010';
  perform pg_temp.check(v_subscription is not null and exists(select 1 from public.subscription_period_snapshots where subscription_id=v_subscription),
    'ENTITLEMENT_SNAPSHOT_NOT_ATOMIC');
  v_event:=public.p309_reserve_stripe_event('test','evt_due',repeat('e',64),101,'customer.subscription.updated','cus_fixture','sub_fixture');
  v_result:=public.p309_apply_stripe_subscription_event((v_event->>'eventId')::uuid,'cus_fixture','sub_fixture','price_fixture',
    'past_due',now(),now()+interval '1 month',false,null,19900,'AED','month','95900000-0000-4000-8000-000000000010');
  perform pg_temp.check((select grace_until=to_timestamp(101)+interval '7 days' from public.subscriptions where id=v_subscription),
    'PAST_DUE_GRACE_NOT_DETERMINISTIC');
  perform pg_temp.check((select status='provider_unavailable' from public.p309_consume_plan_allowance(
    '95900000-0000-4000-8000-000000000010','95900000-0000-4000-8000-000000000201','employees',1,'grace_test',v_subscription)),
    'EXPIRED_GRACE_ACCEPTED');
  update public.subscriptions set pending_plan='starter',pending_cadence='monthly',pending_effective_at=now()
    where id=v_subscription;
  v_event:=public.p309_reserve_stripe_event('test','evt_recovered',repeat('f',64),102,'customer.subscription.updated','cus_fixture','sub_fixture');
  v_result:=public.p309_apply_stripe_subscription_event((v_event->>'eventId')::uuid,'cus_fixture','sub_fixture','price_fixture',
    'active',now(),now()+interval '1 month',false,null,19900,'AED','month','95900000-0000-4000-8000-000000000010');
  perform pg_temp.check((select grace_until is null and pending_plan is null and pending_cadence is null
    and pending_effective_at is null from public.subscriptions where id=v_subscription),'RECOVERY_STATE_NOT_CLEARED');
  perform pg_temp.check((select status='allowed' from public.p309_consume_plan_allowance(
    '95900000-0000-4000-8000-000000000010','95900000-0000-4000-8000-000000000202','employees',1,'recovery_test',v_subscription)),
    'RECOVERY_ALLOWANCE_NOT_RESTORED');
  v_event:=public.p309_reserve_stripe_event('test','evt_stale',repeat('c',64),99,'customer.subscription.updated','cus_fixture','sub_fixture');
  v_result:=public.p309_apply_stripe_subscription_event((v_event->>'eventId')::uuid,'cus_fixture','sub_fixture','price_fixture',
    'past_due',now(),now()+interval '1 month',false,null,19900,'AED','month','95900000-0000-4000-8000-000000000010');
  perform pg_temp.check(v_result->>'state'='stale' and (select status='active' from public.subscriptions where id=v_subscription),
    'STALE_EVENT_APPLIED');
  begin
    perform public.p309_reserve_stripe_event('test','evt_fixture',repeat('d',64),100,'customer.subscription.created','cus_fixture','sub_fixture');
    raise exception 'BODY_CONFLICT_ACCEPTED'; exception when sqlstate 'P3099' then null;
  end;
end;
$fixture$;
rollback;
