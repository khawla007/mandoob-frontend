-- P3.09 Tap integration. External effects use this migration's own leases;
-- P3.10 event-job leases are intentionally not an effect-execution primitive.
begin;

insert into public.event_contract_registrations (event_type,event_version,payload_schema) values
  ('finance.payment.reserved',1,'{"resource_id":"uuid","invoice_id":"uuid","operation_id":"uuid","state":"state","amount_minor":"integer","currency":"reference"}'),
  ('finance.payment.reconciled',1,'{"resource_id":"uuid","invoice_id":"uuid","operation_id":"uuid","state":"state","amount_minor":"integer","currency":"reference"}')
on conflict(event_type,event_version) do nothing;
insert into public.event_consumer_registrations
  (consumer_name,event_type,event_version,max_attempts,default_lease_seconds,enabled)
select 'internal.finance.projection',registration.event_type,registration.event_version,5,120,true
from public.event_contract_registrations registration
where registration.event_type in ('finance.payment.reserved','finance.payment.reconciled')
on conflict(consumer_name,event_type,event_version) do nothing;

create table public.tap_provider_destinations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  provider text not null default 'tap' check (provider='tap'),
  account_id text not null check (pg_catalog.char_length(pg_catalog.btrim(account_id)) between 1 and 255),
  destination_hash text not null check (destination_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (destination_hash), unique (provider, account_id), unique (tenant_id, company_id, id),
  foreign key (tenant_id,company_id) references public.company_profiles(tenant_id,id) on delete restrict,
  foreign key (tenant_id,provider) references public.tenant_payment_config(tenant_id,provider) on delete restrict
);

create table public.payment_provider_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  customer_profile_id uuid not null,
  invoice_id uuid not null,
  payment_id uuid not null,
  operation_id uuid not null,
  expected_invoice_version bigint not null check (expected_invoice_version >= 0),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  provider text not null default 'tap' check (provider='tap'),
  destination_id uuid not null,
  provider_effect_key text not null check (pg_catalog.char_length(pg_catalog.btrim(provider_effect_key)) between 1 and 255),
  provider_effect_hash text not null check (provider_effect_hash ~ '^[a-f0-9]{64}$'),
  provider_reference text,
  redirect_url text,
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  currency text not null references public.finance_currencies(code),
  state text not null default 'reserved' check (state in ('reserved','attached','succeeded','failed','voided','compensation_required','compensated','compensation_failed')),
  failure_code text,
  compensation_effect_key text unique,
  compensation_reference text unique,
  last_provider_occurred_at timestamptz,
  last_provider_event_id text,
  last_provider_body_hash text check (last_provider_body_hash is null or last_provider_body_hash ~ '^[a-f0-9]{64}$'),
  effect_lease_token uuid not null default pg_catalog.gen_random_uuid(),
  effect_lease_expires_at timestamptz not null default (pg_catalog.clock_timestamp()+interval '5 minutes'),
  lease_owner uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (customer_profile_id, operation_id),
  unique (provider, provider_effect_key),
  unique (tenant_id,company_id,id),
  unique (tenant_id,invoice_id,payment_id),
  foreign key (tenant_id,company_id) references public.company_profiles(tenant_id,id) on delete restrict,
  foreign key (company_id,customer_profile_id) references public.customer_profiles(linked_company_id,profile_id) on delete restrict,
  foreign key (tenant_id,company_id,invoice_id) references public.invoices(tenant_id,company_id,id) on delete restrict,
  foreign key (tenant_id,invoice_id,payment_id) references public.payments(tenant_id,invoice_id,id) on delete restrict,
  foreign key (tenant_id,company_id,destination_id) references public.tap_provider_destinations(tenant_id,company_id,id) on delete restrict,
  check ((lease_token is null and lease_owner is null and lease_expires_at is null)
    or (lease_token is not null and lease_owner is not null and lease_expires_at is not null))
);

create table public.tap_provider_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  destination_id uuid not null references public.tap_provider_destinations(id) on delete restrict,
  provider_event_id text not null check (pg_catalog.char_length(pg_catalog.btrim(provider_event_id)) between 1 and 255),
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  provider_reference text not null,
  amount_minor bigint not null,
  currency text not null references public.finance_currencies(code),
  provider_status text not null,
  provider_occurred_at timestamptz not null,
  state text not null default 'reserved' check (state in ('reserved','applied','ignored','compensation_required')),
  fence_token uuid not null default pg_catalog.gen_random_uuid(),
  lease_owner uuid,
  lease_expires_at timestamptz,
  received_at timestamptz not null default pg_catalog.clock_timestamp(),
  reconciled_at timestamptz,
  unique (destination_id, provider_event_id)
);

alter table public.refunds add column provider_effect_key text;
alter table public.refunds add column provider_effect_hash text;
alter table public.refunds add column provider_effect_state text;
alter table public.refunds add column recovery_lease_owner uuid;
alter table public.refunds add column recovery_lease_token uuid;
alter table public.refunds add column recovery_lease_expires_at timestamptz;
alter table public.refunds add constraint refunds_p309_effect_shape check (
  (provider_effect_key is null and provider_effect_hash is null and provider_effect_state is null)
  or (provider_effect_key is not null and provider_effect_hash ~ '^[a-f0-9]{64}$'
      and provider_effect_state in ('reserved','attached','succeeded','failed'))
) not valid;
create unique index refunds_p309_effect_key on public.refunds(provider_effect_key) where provider_effect_key is not null;

alter table public.tap_provider_destinations enable row level security;
alter table public.payment_provider_attempts enable row level security;
alter table public.tap_provider_events enable row level security;
revoke all on table public.tap_provider_destinations,public.payment_provider_attempts,public.tap_provider_events from public,anon,authenticated;
grant select,insert,update on table public.tap_provider_destinations,public.payment_provider_attempts,public.tap_provider_events to service_role;

create function private.p309_require_service() returns void language plpgsql security definer set search_path = '' as $$
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then
    raise exception using errcode='42501',message='FORBIDDEN';
  end if;
end; $$;

create function public.p309_reserve_payment_attempt(
  p_tenant_id uuid,p_company_id uuid,p_customer_profile_id uuid,p_invoice_id uuid,
  p_operation_id uuid,p_expected_invoice_version bigint,p_payload_hash text,p_destination_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices%rowtype; v_attempt public.payment_provider_attempts%rowtype;
  v_payment uuid:=pg_catalog.gen_random_uuid(); v_key text; v_effect_hash text;
  v_allocated bigint; v_credited bigint; v_refunded bigint; v_collectible bigint;
begin
  perform private.p309_require_service();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_customer_profile_id::text||':'||p_operation_id::text,0));
  select * into v_attempt from public.payment_provider_attempts
    where customer_profile_id=p_customer_profile_id and operation_id=p_operation_id for update;
  if found then
    if v_attempt.payload_hash<>p_payload_hash or v_attempt.expected_invoice_version<>p_expected_invoice_version
    then raise exception using errcode='23505',message='OPERATION_REUSED'; end if;
    if v_attempt.state='reserved' and v_attempt.provider_reference is null
      and v_attempt.effect_lease_expires_at<=pg_catalog.clock_timestamp() then
      update public.payment_provider_attempts set effect_lease_token=pg_catalog.gen_random_uuid(),
        effect_lease_expires_at=pg_catalog.clock_timestamp()+interval '5 minutes',updated_at=pg_catalog.clock_timestamp()
        where id=v_attempt.id returning * into v_attempt;
      return pg_catalog.jsonb_build_object('attemptId',v_attempt.id,'paymentId',v_attempt.payment_id,'effectKey',v_attempt.provider_effect_key,
        'payloadHash',v_attempt.payload_hash,'state',v_attempt.state,'providerReference',v_attempt.provider_reference,
        'redirectUrl',v_attempt.redirect_url,'amountMinor',v_attempt.amount_minor,'currency',v_attempt.currency,
        'effectToken',v_attempt.effect_lease_token,'ownsEffect',true,'replayed',true);
    end if;
    return pg_catalog.jsonb_build_object('attemptId',v_attempt.id,'paymentId',v_attempt.payment_id,'effectKey',v_attempt.provider_effect_key,
      'payloadHash',v_attempt.payload_hash,'state',v_attempt.state,'providerReference',v_attempt.provider_reference,'redirectUrl',v_attempt.redirect_url,
      'amountMinor',v_attempt.amount_minor,'currency',v_attempt.currency,'effectToken',null,'ownsEffect',false,'replayed',true);
  end if;
  select invoice.* into v_invoice from public.invoices invoice
    join public.company_profiles company on company.id=invoice.company_id and company.tenant_id=invoice.tenant_id
    join public.customer_profiles customer on customer.profile_id=invoice.customer_profile_id and customer.linked_company_id=company.id
    join public.tap_provider_destinations destination on destination.id=p_destination_id and destination.tenant_id=company.tenant_id
      and destination.company_id=company.id and destination.enabled
    where invoice.id=p_invoice_id and invoice.tenant_id=p_tenant_id and invoice.company_id=p_company_id
      and invoice.customer_profile_id=p_customer_profile_id and invoice.status='open' and invoice.ledger_eligible for update;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  if v_invoice.version<>p_expected_invoice_version then
    raise exception using errcode='40001',message='STALE_VERSION';
  end if;
  perform allocation.id from public.payment_allocations allocation
    where allocation.tenant_id=p_tenant_id and allocation.company_id=p_company_id and allocation.invoice_id=p_invoice_id for update;
  perform note.id from public.finance_credit_notes note
    where note.tenant_id=p_tenant_id and note.company_id=p_company_id and note.invoice_id=p_invoice_id for update;
  perform allocation.id from public.refund_allocations allocation
    where allocation.tenant_id=p_tenant_id and allocation.company_id=p_company_id and allocation.invoice_id=p_invoice_id for update;
  select coalesce(pg_catalog.sum(allocation.amount_minor)::bigint,0::bigint) into v_allocated
    from public.payment_allocations allocation where allocation.tenant_id=p_tenant_id and allocation.company_id=p_company_id and allocation.invoice_id=p_invoice_id;
  select coalesce(pg_catalog.sum(note.amount_minor)::bigint,0::bigint) into v_credited
    from public.finance_credit_notes note where note.tenant_id=p_tenant_id and note.company_id=p_company_id and note.invoice_id=p_invoice_id;
  select coalesce(pg_catalog.sum(allocation.amount_minor)::bigint,0::bigint) into v_refunded
    from public.refund_allocations allocation where allocation.tenant_id=p_tenant_id and allocation.company_id=p_company_id and allocation.invoice_id=p_invoice_id;
  v_collectible:=v_invoice.amount_minor-v_allocated-v_credited+v_refunded;
  if v_collectible<=0 then raise exception using errcode='23514',message='NOT_COLLECTIBLE'; end if;
  v_key:='p309-charge-'||p_operation_id::text;
  v_effect_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||p_company_id::text||':'||p_invoice_id::text||':'||v_collectible::text||':'||v_invoice.currency,'UTF8')),'hex');
  insert into public.payments(id,tenant_id,invoice_id,provider,amount_minor,currency,status)
    values(v_payment,p_tenant_id,p_invoice_id,'tap',v_collectible,v_invoice.currency,'initiated');
  insert into public.payment_provider_attempts(tenant_id,company_id,customer_profile_id,invoice_id,payment_id,operation_id,expected_invoice_version,
    payload_hash,destination_id,provider_effect_key,provider_effect_hash,amount_minor,currency)
    values(p_tenant_id,p_company_id,p_customer_profile_id,p_invoice_id,v_payment,p_operation_id,p_expected_invoice_version,p_payload_hash,p_destination_id,
      v_key,v_effect_hash,v_collectible,v_invoice.currency) returning * into v_attempt;
  insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details) values
    (p_tenant_id,p_customer_profile_id,'created','system',pg_catalog.jsonb_build_object('entity','payment_attempt','attempt_id',v_attempt.id));
  perform private.p309_publish_event('finance.payment.reserved',p_tenant_id,p_company_id,p_customer_profile_id,p_operation_id,
    pg_catalog.jsonb_build_object('resource_id',v_payment,'invoice_id',p_invoice_id,'operation_id',p_operation_id,'state','reserved',
      'amount_minor',v_collectible,'currency',v_invoice.currency));
  return pg_catalog.jsonb_build_object('attemptId',v_attempt.id,'paymentId',v_payment,'effectKey',v_key,'payloadHash',p_payload_hash,
    'state','reserved','providerReference',null,'redirectUrl',null,'amountMinor',v_collectible,'currency',v_invoice.currency,
    'effectToken',v_attempt.effect_lease_token,'ownsEffect',true,'replayed',false);
end; $$;

create function public.p309_attach_payment_attempt(p_attempt_id uuid,p_effect_key text,p_effect_token uuid,p_provider_reference text,p_redirect_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.payment_provider_attempts%rowtype;
begin
  perform private.p309_require_service();
  select * into v from public.payment_provider_attempts where id=p_attempt_id for update;
  if not found or v.provider_effect_key<>p_effect_key or v.effect_lease_token<>p_effect_token
    or v.effect_lease_expires_at<=pg_catalog.clock_timestamp() or v.state not in ('reserved','attached')
    or (v.provider_reference is not null and v.provider_reference<>p_provider_reference)
  then raise exception using errcode='23514',message='CONFLICT'; end if;
  update public.payment_provider_attempts set provider_reference=p_provider_reference,redirect_url=p_redirect_url,state='attached',updated_at=pg_catalog.clock_timestamp()
    where id=p_attempt_id returning * into v;
  update public.payments set provider_charge_id=p_provider_reference where id=v.payment_id and tenant_id=v.tenant_id;
  return pg_catalog.jsonb_build_object('attemptId',v.id,'paymentId',v.payment_id,'effectKey',v.provider_effect_key,'payloadHash',v.payload_hash,
    'state',v.state,'providerReference',v.provider_reference,'redirectUrl',v.redirect_url,'effectToken',v.effect_lease_token,
    'amountMinor',v.amount_minor,'currency',v.currency,'ownsEffect',true,'replayed',false);
end; $$;

create function public.p309_reconcile_payment_attempt(
  p_attempt_id uuid,p_provider_reference text,p_amount_minor bigint,p_currency text,p_provider_status text,
  p_worker_id uuid default null,p_lease_token uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.payment_provider_attempts%rowtype; v_receipt uuid; v_journal uuid:=pg_catalog.gen_random_uuid(); v_allocation uuid:=pg_catalog.gen_random_uuid();
  v_result jsonb; v_target text; v_invoice_status text; v_invoice_amount bigint;
  v_allocated bigint; v_credited bigint; v_refunded bigint; v_collectible bigint;
begin
  perform private.p309_require_service();
  select attempt.* into v from public.payment_provider_attempts attempt
    join public.company_profiles company on company.id=attempt.company_id and company.tenant_id=attempt.tenant_id
    join public.customer_profiles customer on customer.profile_id=attempt.customer_profile_id and customer.linked_company_id=company.id
    join public.invoices invoice on invoice.id=attempt.invoice_id and invoice.tenant_id=attempt.tenant_id and invoice.company_id=attempt.company_id
      and invoice.customer_profile_id=attempt.customer_profile_id
    join public.payments payment on payment.id=attempt.payment_id and payment.tenant_id=attempt.tenant_id and payment.invoice_id=attempt.invoice_id
    where attempt.id=p_attempt_id for update of invoice,payment,attempt;
  if not found or v.provider_reference<>p_provider_reference or v.amount_minor<>p_amount_minor or v.currency<>p_currency
  then raise exception using errcode='23514',message='PROVIDER_MISMATCH'; end if;
  if p_worker_id is not null and not (v.lease_owner=p_worker_id and v.lease_token=p_lease_token
      and v.lease_expires_at>pg_catalog.clock_timestamp()) then
    raise exception using errcode='23514',message='STALE_FENCE';
  elsif p_worker_id is null and p_lease_token is not null and not (v.effect_lease_token=p_lease_token
      and v.effect_lease_expires_at>pg_catalog.clock_timestamp()) then
    raise exception using errcode='23514',message='STALE_FENCE';
  end if;
  select invoice.status,invoice.amount_minor into v_invoice_status,v_invoice_amount from public.invoices invoice
    where invoice.id=v.invoice_id and invoice.tenant_id=v.tenant_id and invoice.company_id=v.company_id;
  if v.state in ('succeeded','failed','voided','compensation_required','compensated','compensation_failed') then
    return pg_catalog.jsonb_build_object('attemptId',v.id,'state',v.state,'replayed',true);
  end if;
  v_target:=case when pg_catalog.upper(p_provider_status)='CAPTURED' then 'succeeded'
    when pg_catalog.upper(p_provider_status) in ('FAILED','DECLINED','CANCELLED','TIMEDOUT') then 'failed'
    when pg_catalog.upper(p_provider_status)='VOID' then 'voided' else null end;
  if v_target is null then return pg_catalog.jsonb_build_object('attemptId',v.id,'state',v.state,'replayed',true); end if;
  if v_target='succeeded' and v_invoice_status<>'open' then
    update public.payment_provider_attempts set state='compensation_required',failure_code='captured_after_invoice_closed',
      compensation_effect_key='p309-compensation-'||v.id::text,lease_owner=null,lease_token=null,lease_expires_at=null,
      updated_at=pg_catalog.clock_timestamp() where id=v.id;
    update public.payments set status='failed',failure_reason='captured_after_invoice_closed',received_at=pg_catalog.clock_timestamp()
      where id=v.payment_id and tenant_id=v.tenant_id;
    insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details) values
      (v.tenant_id,v.customer_profile_id,'updated','system',pg_catalog.jsonb_build_object(
        'entity','payment_attempt','attempt_id',v.id,'state','compensation_required'));
    perform private.p309_publish_event('finance.payment.reconciled',v.tenant_id,v.company_id,v.customer_profile_id,
      private.p309_event_uuid('payment-reconcile:'||v.operation_id::text||':compensation_required'),
      pg_catalog.jsonb_build_object('resource_id',v.payment_id,'invoice_id',v.invoice_id,'operation_id',v.operation_id,
        'state','compensation_required','amount_minor',v.amount_minor,'currency',v.currency));
    return pg_catalog.jsonb_build_object('attemptId',v.id,'paymentId',v.payment_id,'invoiceId',v.invoice_id,
      'state','compensation_required','replayed',false);
  end if;
  if v_target='succeeded' then
    perform allocation.id from public.payment_allocations allocation where allocation.invoice_id=v.invoice_id for update;
    perform note.id from public.finance_credit_notes note where note.invoice_id=v.invoice_id for update;
    perform allocation.id from public.refund_allocations allocation where allocation.invoice_id=v.invoice_id for update;
    select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint) into v_allocated from public.payment_allocations where invoice_id=v.invoice_id;
    select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint) into v_credited from public.finance_credit_notes where invoice_id=v.invoice_id;
    select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint) into v_refunded from public.refund_allocations where invoice_id=v.invoice_id;
    v_collectible:=v_invoice_amount-v_allocated-v_credited+v_refunded;
    if v_collectible<>v.amount_minor then
      update public.payment_provider_attempts set state='compensation_required',failure_code='captured_after_collectible_changed',
        compensation_effect_key='p309-compensation-'||v.id::text,lease_owner=null,lease_token=null,lease_expires_at=null,
        updated_at=pg_catalog.clock_timestamp() where id=v.id;
      update public.payments set status='failed',failure_reason='captured_after_collectible_changed',received_at=pg_catalog.clock_timestamp()
        where id=v.payment_id and tenant_id=v.tenant_id;
      insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details) values
        (v.tenant_id,v.customer_profile_id,'updated','system',pg_catalog.jsonb_build_object(
          'entity','payment_attempt','attempt_id',v.id,'state','compensation_required'));
      perform private.p309_publish_event('finance.payment.reconciled',v.tenant_id,v.company_id,v.customer_profile_id,
        private.p309_event_uuid('payment-reconcile:'||v.operation_id::text||':compensation_required'),
        pg_catalog.jsonb_build_object('resource_id',v.payment_id,'invoice_id',v.invoice_id,'operation_id',v.operation_id,
          'state','compensation_required','amount_minor',v.amount_minor,'currency',v.currency));
      return pg_catalog.jsonb_build_object('attemptId',v.id,'paymentId',v.payment_id,'invoiceId',v.invoice_id,
        'state','compensation_required','replayed',false);
    end if;
  end if;
  update public.payment_provider_attempts set state=v_target,failure_code=case when v_target='failed' then pg_catalog.lower(p_provider_status) end,
    lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=pg_catalog.clock_timestamp() where id=v.id;
  update public.payments set status=v_target,received_at=pg_catalog.clock_timestamp(),
    failure_reason=case when v_target in ('failed','voided') then pg_catalog.lower(p_provider_status) end where id=v.payment_id;
  if v_target='succeeded' then
    update public.invoices set status='paid',paid_at=pg_catalog.clock_timestamp(),version=version+1 where id=v.invoice_id;
    v_result:=pg_catalog.jsonb_build_object('attemptId',v.id,'paymentId',v.payment_id,'invoiceId',v.invoice_id,'state',v_target,'replayed',false);
    v_receipt:=private.p309_command_receipt(v.tenant_id,v.company_id,v.customer_profile_id,v.operation_id,'payment',v.payment_id,
      0,1,v.payload_hash,v_result);
    insert into public.payment_allocations(id,tenant_id,company_id,invoice_id,payment_id,operation_receipt_id,amount_minor,currency)
      values(v_allocation,v.tenant_id,v.company_id,v.invoice_id,v.payment_id,v_receipt,v.amount_minor,v.currency);
    insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
      values(v_journal,v.tenant_id,v.company_id,v_receipt,'payment_allocation',v_allocation,v.currency,pg_catalog.clock_timestamp());
    insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency) values(v_journal,1,'cash_clearing',v.amount_minor,v.currency);
    insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency) values(v_journal,2,'receivable',v.amount_minor,v.currency);
    perform private.p309_post_journal(v_journal);
    perform private.p309_capture_receipt_snapshot(v_receipt,'payment',v.payment_id,v.invoice_id,
      v_journal,'succeeded','card');
  else
    v_result:=pg_catalog.jsonb_build_object('attemptId',v.id,'paymentId',v.payment_id,'invoiceId',v.invoice_id,'state',v_target,'replayed',false);
    insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details) values
      (v.tenant_id,v.customer_profile_id,'updated','system',pg_catalog.jsonb_build_object('entity','payment_attempt','attempt_id',v.id,'state',v_target));
  end if;
  perform private.p309_publish_event('finance.payment.reconciled',v.tenant_id,v.company_id,v.customer_profile_id,
    private.p309_event_uuid('payment-reconcile:'||v.operation_id::text||':'||v_target),
    pg_catalog.jsonb_build_object('resource_id',v.payment_id,'invoice_id',v.invoice_id,'operation_id',v.operation_id,'state',v_target,
      'amount_minor',v.amount_minor,'currency',v.currency));
  return v_result;
end; $$;

create function public.p309_fail_payment_attempt(p_attempt_id uuid,p_failure_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.payment_provider_attempts%rowtype;
begin
  perform private.p309_require_service();
  select attempt.* into v from public.payment_provider_attempts attempt
    join public.invoices invoice on invoice.id=attempt.invoice_id and invoice.tenant_id=attempt.tenant_id and invoice.company_id=attempt.company_id
    join public.payments payment on payment.id=attempt.payment_id and payment.tenant_id=attempt.tenant_id and payment.invoice_id=attempt.invoice_id
    join public.customer_profiles customer on customer.profile_id=attempt.customer_profile_id and customer.linked_company_id=attempt.company_id
    where attempt.id=p_attempt_id for update of invoice,payment,attempt;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  if v.state='failed' then return pg_catalog.jsonb_build_object('attemptId',v.id,'state','failed','replayed',true); end if;
  if v.state<>'reserved' then raise exception using errcode='23514',message='CONFLICT'; end if;
  update public.payment_provider_attempts set state='failed',failure_code=p_failure_code,updated_at=pg_catalog.clock_timestamp() where id=v.id;
  update public.payments set status='failed',failure_reason=p_failure_code,received_at=pg_catalog.clock_timestamp() where id=v.payment_id;
  insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details) values
    (v.tenant_id,v.customer_profile_id,'updated','system',pg_catalog.jsonb_build_object('entity','payment_attempt','attempt_id',v.id,'state','failed'));
  perform private.p309_publish_event('finance.payment.reconciled',v.tenant_id,v.company_id,v.customer_profile_id,
    private.p309_event_uuid('payment-reconcile:'||v.operation_id::text||':failed'),
    pg_catalog.jsonb_build_object('resource_id',v.payment_id,'invoice_id',v.invoice_id,'operation_id',v.operation_id,
      'state','failed','amount_minor',v.amount_minor,'currency',v.currency));
  return pg_catalog.jsonb_build_object('attemptId',v.id,'state','failed','replayed',false);
end; $$;

create function public.p309_reserve_tap_event(p_destination_id uuid,p_provider_event_id text,p_body_hash text,
  p_provider_reference text,p_amount_minor bigint,p_currency text,p_provider_status text,p_provider_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.tap_provider_events%rowtype;
begin
  perform private.p309_require_service();
  insert into public.tap_provider_events(destination_id,provider_event_id,body_hash,provider_reference,amount_minor,currency,provider_status,provider_occurred_at)
    values(p_destination_id,p_provider_event_id,p_body_hash,p_provider_reference,p_amount_minor,p_currency,p_provider_status,p_provider_occurred_at)
    on conflict(destination_id,provider_event_id) do nothing returning * into v;
  if not found then
    select * into v from public.tap_provider_events where destination_id=p_destination_id
      and provider_event_id=p_provider_event_id for update;
    if v.state='reserved' and v.body_hash=p_body_hash and v.provider_reference=p_provider_reference
      and v.amount_minor=p_amount_minor and v.currency=p_currency and v.provider_status=p_provider_status then
      if v.lease_expires_at is not null and v.lease_expires_at>pg_catalog.clock_timestamp() then
        return pg_catalog.jsonb_build_object('reserved',false);
      end if;
      update public.tap_provider_events set fence_token=pg_catalog.gen_random_uuid(),lease_owner=null,lease_expires_at=null
        where id=v.id returning * into v;
      return pg_catalog.jsonb_build_object('reserved',true,'eventId',v.id,'token',v.fence_token,'recovered',true);
    end if;
    return pg_catalog.jsonb_build_object('reserved',false);
  end if;
  return pg_catalog.jsonb_build_object('reserved',true,'eventId',v.id,'token',v.fence_token);
end; $$;

create function public.p309_reconcile_tap_event(p_event_id uuid,p_fence_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.tap_provider_events%rowtype; v_attempt public.payment_provider_attempts%rowtype; v_result jsonb;
begin
  perform private.p309_require_service();
  select * into v_event from public.tap_provider_events where id=p_event_id and fence_token=p_fence_token for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','fenced'); end if;
  if v_event.state<>'reserved' then return pg_catalog.jsonb_build_object('outcome','duplicate'); end if;
  select attempt.* into v_attempt from public.payment_provider_attempts attempt
    join public.tap_provider_destinations destination on destination.id=attempt.destination_id
    where attempt.destination_id=v_event.destination_id and attempt.provider_reference=v_event.provider_reference for update;
  if not found then update public.tap_provider_events set state='ignored',reconciled_at=pg_catalog.clock_timestamp() where id=v_event.id;
    return pg_catalog.jsonb_build_object('outcome','mismatch'); end if;
  if v_attempt.amount_minor<>v_event.amount_minor or v_attempt.currency<>v_event.currency then
    update public.tap_provider_events set state='ignored',reconciled_at=pg_catalog.clock_timestamp()
      where id=v_event.id and fence_token=p_fence_token;
    return pg_catalog.jsonb_build_object('outcome','mismatch');
  end if;
  if v_attempt.last_provider_occurred_at is not null and
    (v_event.provider_occurred_at,v_event.provider_event_id,v_event.body_hash)
      <=(v_attempt.last_provider_occurred_at,v_attempt.last_provider_event_id,v_attempt.last_provider_body_hash) then
    update public.tap_provider_events set state='ignored',reconciled_at=pg_catalog.clock_timestamp() where id=v_event.id;
    return pg_catalog.jsonb_build_object('outcome','stale');
  end if;
  if v_attempt.state='failed' and pg_catalog.upper(v_event.provider_status)='CAPTURED' then
    update public.payment_provider_attempts set state='attached',failure_code=null where id=v_attempt.id;
    update public.payments set status='initiated',failure_reason=null where id=v_attempt.payment_id;
  end if;
  v_result:=public.p309_reconcile_payment_attempt(v_attempt.id,v_event.provider_reference,v_event.amount_minor,v_event.currency,v_event.provider_status);
  update public.payment_provider_attempts set last_provider_occurred_at=v_event.provider_occurred_at,
    last_provider_event_id=v_event.provider_event_id,last_provider_body_hash=v_event.body_hash where id=v_attempt.id;
  update public.tap_provider_events set
    state=case when v_result->>'state'='compensation_required' then 'compensation_required' else 'applied' end,
    reconciled_at=pg_catalog.clock_timestamp(),lease_owner=null,lease_expires_at=null
    where id=v_event.id and fence_token=p_fence_token;
  return pg_catalog.jsonb_build_object('outcome','updated','result',v_result);
end; $$;

create function public.p309_claim_tap_event_recovery(p_worker_id uuid,p_limit integer default 25,p_lease_seconds integer default 60)
returns setof public.tap_provider_events language plpgsql security definer set search_path = '' as $$
begin
  perform private.p309_require_service();
  return query with candidates as (
    select event.id from public.tap_provider_events event
    where event.state='reserved' and (event.lease_expires_at is null or event.lease_expires_at<pg_catalog.clock_timestamp())
    order by event.received_at,event.id for update skip locked limit least(greatest(p_limit,1),100)
  ) update public.tap_provider_events event set lease_owner=p_worker_id,fence_token=pg_catalog.gen_random_uuid(),
      lease_expires_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(greatest(p_lease_seconds,5),300))
    from candidates where event.id=candidates.id returning event.*;
end; $$;

create function public.p309_claim_tap_recovery(p_worker_id uuid,p_limit integer default 25,p_lease_seconds integer default 60)
returns setof public.payment_provider_attempts language plpgsql security definer set search_path = '' as $$
begin
  perform private.p309_require_service();
  return query with candidates as (
    select attempt.id from public.payment_provider_attempts attempt
    where attempt.state in ('reserved','attached')
      and (attempt.state='attached' or attempt.effect_lease_expires_at<pg_catalog.clock_timestamp())
      and (attempt.lease_expires_at is null or attempt.lease_expires_at<pg_catalog.clock_timestamp())
    order by attempt.created_at,attempt.id for update skip locked limit least(greatest(p_limit,1),100)
  ) update public.payment_provider_attempts attempt set lease_owner=p_worker_id,lease_token=pg_catalog.gen_random_uuid(),
      lease_expires_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(greatest(p_lease_seconds,5),300))
    from candidates where attempt.id=candidates.id returning attempt.*;
end; $$;

create function public.p309_complete_tap_recovery(p_attempt_id uuid,p_worker_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform private.p309_require_service();
  update public.payment_provider_attempts set lease_owner=null,lease_token=null,lease_expires_at=null
    where id=p_attempt_id and lease_owner=p_worker_id and lease_token=p_lease_token and lease_expires_at>pg_catalog.clock_timestamp();
  get diagnostics v_count=row_count; return v_count=1;
end; $$;

create function public.p309_attach_payment_attempt_recovery(
  p_attempt_id uuid,p_worker_id uuid,p_lease_token uuid,p_effect_key text,p_provider_reference text,p_redirect_url text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.payment_provider_attempts%rowtype;
begin
  perform private.p309_require_service();
  select * into v from public.payment_provider_attempts where id=p_attempt_id for update;
  if not found or v.lease_owner<>p_worker_id or v.lease_token<>p_lease_token
    or v.lease_expires_at<=pg_catalog.clock_timestamp() or v.provider_effect_key<>p_effect_key
    or (v.provider_reference is not null and v.provider_reference<>p_provider_reference)
  then raise exception using errcode='23514',message='STALE_FENCE'; end if;
  update public.payment_provider_attempts set provider_reference=p_provider_reference,redirect_url=p_redirect_url,
    state='attached',updated_at=pg_catalog.clock_timestamp() where id=p_attempt_id returning * into v;
  update public.payments set provider_charge_id=p_provider_reference where id=v.payment_id and tenant_id=v.tenant_id;
  return pg_catalog.jsonb_build_object('attemptId',v.id,'state',v.state,'providerReference',v.provider_reference);
end; $$;

-- Captures that arrive after an invoice becomes uncollectible are external money
-- movements, but are never posted as invoice cash. A separate fenced worker uses
-- the persisted compensation key to refund the exact captured charge once.
create function public.p309_claim_tap_compensation(p_worker_id uuid,p_limit integer default 25,p_lease_seconds integer default 60)
returns setof public.payment_provider_attempts language plpgsql security definer set search_path = '' as $$
begin
  perform private.p309_require_service();
  return query with candidates as (
    select attempt.id from public.payment_provider_attempts attempt
    join public.payments payment on payment.id=attempt.payment_id and payment.tenant_id=attempt.tenant_id
    join public.invoices invoice on invoice.id=attempt.invoice_id and invoice.tenant_id=attempt.tenant_id
      and invoice.company_id=attempt.company_id
    join public.company_profiles company on company.id=attempt.company_id and company.tenant_id=attempt.tenant_id
    join public.customer_profiles customer on customer.profile_id=attempt.customer_profile_id
      and customer.linked_company_id=company.id
    where attempt.state='compensation_required' and attempt.provider_reference is not null
      and attempt.compensation_effect_key is not null
      and (attempt.lease_expires_at is null or attempt.lease_expires_at<pg_catalog.clock_timestamp())
    order by attempt.created_at,attempt.id for update of attempt skip locked limit least(greatest(p_limit,1),100)
  ) update public.payment_provider_attempts attempt set lease_owner=p_worker_id,lease_token=pg_catalog.gen_random_uuid(),
      lease_expires_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(greatest(p_lease_seconds,5),300))
    from candidates where attempt.id=candidates.id returning attempt.*;
end; $$;

create function public.p309_attach_tap_compensation(
  p_attempt_id uuid,p_worker_id uuid,p_lease_token uuid,p_effect_key text,p_compensation_reference text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.payment_provider_attempts%rowtype;
begin
  perform private.p309_require_service();
  select * into v from public.payment_provider_attempts where id=p_attempt_id for update;
  if not found or v.state<>'compensation_required' or v.lease_owner<>p_worker_id or v.lease_token<>p_lease_token
    or v.lease_expires_at<=pg_catalog.clock_timestamp() or v.compensation_effect_key<>p_effect_key
    or (v.compensation_reference is not null and v.compensation_reference<>p_compensation_reference)
  then raise exception using errcode='23514',message='STALE_FENCE'; end if;
  update public.payment_provider_attempts set compensation_reference=p_compensation_reference,
    updated_at=pg_catalog.clock_timestamp() where id=p_attempt_id returning * into v;
  return pg_catalog.jsonb_build_object('attemptId',v.id,'state',v.state,'compensationReference',v.compensation_reference);
end; $$;

create function public.p309_reconcile_tap_compensation(
  p_attempt_id uuid,p_worker_id uuid,p_lease_token uuid,p_compensation_reference text,p_status text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.payment_provider_attempts%rowtype; v_target text;
begin
  perform private.p309_require_service();
  select attempt.* into v from public.payment_provider_attempts attempt
    join public.payments payment on payment.id=attempt.payment_id and payment.tenant_id=attempt.tenant_id
    join public.invoices invoice on invoice.id=attempt.invoice_id and invoice.tenant_id=attempt.tenant_id
      and invoice.company_id=attempt.company_id
    join public.company_profiles company on company.id=attempt.company_id and company.tenant_id=attempt.tenant_id
    join public.customer_profiles customer on customer.profile_id=attempt.customer_profile_id
      and customer.linked_company_id=company.id
    where attempt.id=p_attempt_id for update of attempt,payment,invoice;
  if not found or v.state<>'compensation_required' or v.lease_owner<>p_worker_id or v.lease_token<>p_lease_token
    or v.lease_expires_at<=pg_catalog.clock_timestamp() or v.compensation_reference<>p_compensation_reference
  then raise exception using errcode='23514',message='STALE_FENCE'; end if;
  v_target:=case when p_status='succeeded' then 'compensated' when p_status='failed' then 'compensation_failed' end;
  if v_target is null then raise exception using errcode='23514',message='INVALID_STATE'; end if;
  update public.payment_provider_attempts set state=v_target,lease_owner=null,lease_token=null,lease_expires_at=null,
    updated_at=pg_catalog.clock_timestamp() where id=v.id;
  update public.payments set status='failed',failure_reason=v_target where id=v.payment_id and tenant_id=v.tenant_id;
  insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details) values
    (v.tenant_id,v.customer_profile_id,'updated','system',pg_catalog.jsonb_build_object(
      'entity','payment_attempt','attempt_id',v.id,'state',v_target));
  perform private.p309_publish_event('finance.payment.reconciled',v.tenant_id,v.company_id,v.customer_profile_id,
    private.p309_event_uuid('payment-reconcile:'||v.operation_id::text||':'||v_target),
    pg_catalog.jsonb_build_object('resource_id',v.payment_id,'invoice_id',v.invoice_id,'operation_id',v.operation_id,
      'state',v_target,'amount_minor',v.amount_minor,'currency',v.currency));
  return pg_catalog.jsonb_build_object('attemptId',v.id,'state',v_target,'replayed',false);
end; $$;

create function public.p309_complete_tap_compensation(p_attempt_id uuid,p_worker_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform private.p309_require_service();
  update public.payment_provider_attempts set lease_owner=null,lease_token=null,lease_expires_at=null
    where id=p_attempt_id and state='compensation_required' and lease_owner=p_worker_id and lease_token=p_lease_token
      and lease_expires_at>pg_catalog.clock_timestamp();
  get diagnostics v_count=row_count; return v_count=1;
end; $$;

-- Refund recovery uses identical P3.09-owned fences and never P3.10 job leases.
-- The authoritative prepare RPC locks allocations and raises REFUND_EXCEEDS_CAPTURE;
-- recovery may only claim its already-validated durable intent.
create function public.p309_claim_tap_refund_recovery(p_worker_id uuid,p_limit integer default 25,p_lease_seconds integer default 60)
returns setof public.refunds language plpgsql security definer set search_path = '' as $$
begin
  perform private.p309_require_service();
  return query with candidates as (
    select refund.id from public.refunds refund join public.payments payment on payment.id=refund.payment_id and payment.tenant_id=refund.tenant_id
    join public.invoices invoice on invoice.id=payment.invoice_id and invoice.tenant_id=payment.tenant_id
    join public.company_profiles company on company.id=invoice.company_id and company.tenant_id=invoice.tenant_id
    join public.customer_profiles customer on customer.profile_id=invoice.customer_profile_id and customer.linked_company_id=company.id
    where refund.status='pending' and refund.provider_effect_key is not null
      and (refund.recovery_lease_expires_at is null or refund.recovery_lease_expires_at<pg_catalog.clock_timestamp())
    order by refund.created_at,refund.id for update of refund skip locked limit least(greatest(p_limit,1),100)
  ) update public.refunds refund set recovery_lease_owner=p_worker_id,recovery_lease_token=pg_catalog.gen_random_uuid(),
      recovery_lease_expires_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(greatest(p_lease_seconds,5),300))
    from candidates where refund.id=candidates.id returning refund.*;
end; $$;

create function public.p309_reserve_refund_effect(p_refund_id uuid,p_provider_effect_key text,p_provider_effect_hash text,p_worker_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_refund public.refunds%rowtype;
begin
  perform private.p309_require_service();
  select refund.* into v_refund from public.refunds refund
    join public.payments payment on payment.id=refund.payment_id and payment.tenant_id=refund.tenant_id
    join public.invoices invoice on invoice.id=payment.invoice_id and invoice.tenant_id=payment.tenant_id
    join public.company_profiles company on company.id=invoice.company_id and company.tenant_id=invoice.tenant_id
    join public.customer_profiles customer on customer.profile_id=invoice.customer_profile_id and customer.linked_company_id=company.id
    where refund.id=p_refund_id for update of refund;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  if v_refund.provider_effect_key is not null and
    (v_refund.provider_effect_key<>p_provider_effect_key or v_refund.provider_effect_hash<>p_provider_effect_hash)
  then raise exception using errcode='23505',message='OPERATION_REUSED'; end if;
  if v_refund.status<>'pending' then
    return pg_catalog.jsonb_build_object('refundId',v_refund.id,'effectKey',v_refund.provider_effect_key,
      'effectHash',v_refund.provider_effect_hash,'state',v_refund.provider_effect_state,
      'providerReference',v_refund.provider_refund_id,'ownsEffect',false,'leaseToken',null);
  end if;
  if v_refund.recovery_lease_expires_at is not null and v_refund.recovery_lease_expires_at>pg_catalog.clock_timestamp()
    and v_refund.recovery_lease_owner<>p_worker_id then
    return pg_catalog.jsonb_build_object('refundId',v_refund.id,'effectKey',v_refund.provider_effect_key,
      'effectHash',v_refund.provider_effect_hash,'state',v_refund.provider_effect_state,
      'providerReference',v_refund.provider_refund_id,'ownsEffect',false,'leaseToken',null);
  end if;
  update public.refunds set provider_effect_key=p_provider_effect_key,provider_effect_hash=p_provider_effect_hash,
    provider_effect_state=coalesce(provider_effect_state,'reserved'),recovery_lease_owner=p_worker_id,
    recovery_lease_token=pg_catalog.gen_random_uuid(),recovery_lease_expires_at=pg_catalog.clock_timestamp()+interval '5 minutes'
    where id=p_refund_id returning * into v_refund;
  return pg_catalog.jsonb_build_object('refundId',v_refund.id,'effectKey',v_refund.provider_effect_key,
    'effectHash',v_refund.provider_effect_hash,'state',v_refund.provider_effect_state,
    'providerReference',v_refund.provider_refund_id,'ownsEffect',true,'leaseToken',v_refund.recovery_lease_token);
end; $$;

create function private.p309_sync_refund_effect_state() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provider_effect_key is not null then
    new.provider_effect_state:=case when new.status='succeeded' then 'succeeded' when new.status='failed' then 'failed'
      when new.provider_refund_id is not null then 'attached' else coalesce(new.provider_effect_state,'reserved') end;
  end if;
  return new;
end; $$;
create trigger refunds_p309_sync_effect before update on public.refunds for each row execute function private.p309_sync_refund_effect_state();

create function public.p309_attach_refund_effect_recovery(p_refund_id uuid,p_provider_effect_key text,p_provider_refund_id text,
  p_worker_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.refunds%rowtype;
begin
  perform private.p309_require_service();
  select refund.* into v from public.refunds refund
    join public.payments payment on payment.id=refund.payment_id and payment.tenant_id=refund.tenant_id
    join public.invoices invoice on invoice.id=payment.invoice_id and invoice.tenant_id=payment.tenant_id
    join public.company_profiles company on company.id=invoice.company_id and company.tenant_id=invoice.tenant_id
    join public.customer_profiles customer on customer.profile_id=invoice.customer_profile_id and customer.linked_company_id=company.id
    where refund.id=p_refund_id for update of refund;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  if v.status<>'pending' or v.provider_effect_key<>p_provider_effect_key
    or v.recovery_lease_owner<>p_worker_id or v.recovery_lease_token<>p_lease_token
    or v.recovery_lease_expires_at<=pg_catalog.clock_timestamp()
    or (v.provider_refund_id is not null and v.provider_refund_id<>p_provider_refund_id)
  then raise exception using errcode='23514',message='CONFLICT'; end if;
  update public.refunds set provider_refund_id=p_provider_refund_id where id=p_refund_id returning * into v;
  return pg_catalog.jsonb_build_object('refundId',v.id,'providerReference',v.provider_refund_id,'state',v.provider_effect_state);
end; $$;

create function public.p309_complete_tap_refund_recovery(p_refund_id uuid,p_worker_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform private.p309_require_service();
  update public.refunds set recovery_lease_owner=null,recovery_lease_token=null,recovery_lease_expires_at=null
    where id=p_refund_id and recovery_lease_owner=p_worker_id and recovery_lease_token=p_lease_token
      and recovery_lease_expires_at>pg_catalog.clock_timestamp();
  get diagnostics v_count=row_count; return v_count=1;
end; $$;

create function public.p309_reconcile_claimed_refund(
  p_refund_id uuid,p_provider_refund_id text,p_status text,p_worker_id uuid,p_lease_token uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.refunds%rowtype; v_payment public.payments%rowtype; v_invoice public.invoices%rowtype;
  v_actor uuid; v_operation uuid; v_hash text;
begin
  perform private.p309_require_service();
  select refund.* into v from public.refunds refund
    join public.payments payment on payment.id=refund.payment_id and payment.tenant_id=refund.tenant_id
    join public.invoices invoice on invoice.id=payment.invoice_id and invoice.tenant_id=payment.tenant_id
    join public.company_profiles company on company.id=invoice.company_id and company.tenant_id=invoice.tenant_id
    join public.customer_profiles customer on customer.profile_id=invoice.customer_profile_id and customer.linked_company_id=company.id
    where refund.id=p_refund_id;
  select * into v_invoice from public.invoices where id=(select invoice_id from public.payments where id=v.payment_id) and tenant_id=v.tenant_id for update;
  select * into v_payment from public.payments where id=v.payment_id and tenant_id=v.tenant_id and invoice_id=v_invoice.id for update;
  select * into v from public.refunds where id=p_refund_id and tenant_id=v_invoice.tenant_id and payment_id=v_payment.id for update;
  if not found or v.recovery_lease_owner<>p_worker_id or v.recovery_lease_token<>p_lease_token
    or v.recovery_lease_expires_at<=pg_catalog.clock_timestamp()
  then raise exception using errcode='23514',message='STALE_FENCE'; end if;
  if p_provider_refund_id is not null then
    return public.p309_reconcile_pending_refund(p_refund_id,p_provider_refund_id,p_status);
  end if;
  if p_status<>'failed' or v.status<>'pending' or v.provider_refund_id is not null
  then raise exception using errcode='23514',message='CONFLICT'; end if;
  select actor_id into v_actor from public.finance_operation_receipts
    where aggregate_kind='refund' and aggregate_id=p_refund_id order by committed_at,id limit 1;
  if v_actor is null then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  v_operation:=private.p309_event_uuid('refund-recovery:'||p_refund_id::text||':failed:no-provider-reference');
  v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    v_invoice.id::text||':'||v_payment.id::text||':'||p_refund_id::text||':failed:no-provider-reference','UTF8')),'hex');
  return private.p309_reconcile_refund_core(v_invoice.tenant_id,v_invoice.company_id,v_actor,v_operation,
    v_invoice.version,v_hash,v_invoice.id,v_payment.id,p_refund_id,null,'failed',true);
end; $$;

create function public.p309_get_refund_result(p_refund_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_refund public.refunds%rowtype; v_payment public.payments%rowtype; v_invoice public.invoices%rowtype;
  v_allocated bigint; v_refunded bigint;
begin
  perform private.p309_require_service();
  select refund.* into v_refund from public.refunds refund
    join public.payments payment on payment.id=refund.payment_id and payment.tenant_id=refund.tenant_id
    join public.invoices invoice on invoice.id=payment.invoice_id and invoice.tenant_id=payment.tenant_id
    join public.company_profiles company on company.id=invoice.company_id and company.tenant_id=invoice.tenant_id
    join public.customer_profiles customer on customer.profile_id=invoice.customer_profile_id and customer.linked_company_id=company.id
    where refund.id=p_refund_id;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  select * into v_payment from public.payments where id=v_refund.payment_id and tenant_id=v_refund.tenant_id;
  select * into v_invoice from public.invoices where id=v_payment.invoice_id and tenant_id=v_refund.tenant_id;
  select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint) into v_allocated
    from public.payment_allocations where invoice_id=v_invoice.id and tenant_id=v_refund.tenant_id;
  select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint) into v_refunded
    from public.refund_allocations where invoice_id=v_invoice.id and tenant_id=v_refund.tenant_id;
  return pg_catalog.jsonb_build_object('invoiceId',v_invoice.id,'paymentId',v_payment.id,'refundId',v_refund.id,
    'partial',case when v_refund.status='succeeded' then v_refunded<v_allocated else true end,
    'status',v_refund.status,'version',v_invoice.version,'replayed',true);
end; $$;

revoke all on function public.p309_reserve_payment_attempt(uuid,uuid,uuid,uuid,uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.p309_reserve_payment_attempt(uuid,uuid,uuid,uuid,uuid,bigint,text,uuid) to service_role;
revoke all on function public.p309_attach_payment_attempt(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.p309_attach_payment_attempt(uuid,text,uuid,text,text) to service_role;
revoke all on function public.p309_fail_payment_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.p309_fail_payment_attempt(uuid,text) to service_role;
revoke all on function public.p309_reconcile_payment_attempt(uuid,text,bigint,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.p309_reconcile_payment_attempt(uuid,text,bigint,text,text,uuid,uuid) to service_role;
revoke all on function public.p309_reserve_tap_event(uuid,text,text,text,bigint,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.p309_reserve_tap_event(uuid,text,text,text,bigint,text,text,timestamptz) to service_role;
revoke all on function public.p309_reconcile_tap_event(uuid,uuid) from public,anon,authenticated;
grant execute on function public.p309_reconcile_tap_event(uuid,uuid) to service_role;
revoke all on function public.p309_claim_tap_event_recovery(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.p309_claim_tap_event_recovery(uuid,integer,integer) to service_role;
revoke all on function public.p309_claim_tap_recovery(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.p309_claim_tap_recovery(uuid,integer,integer) to service_role;
revoke all on function public.p309_complete_tap_recovery(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.p309_complete_tap_recovery(uuid,uuid,uuid) to service_role;
revoke all on function public.p309_attach_payment_attempt_recovery(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.p309_attach_payment_attempt_recovery(uuid,uuid,uuid,text,text,text) to service_role;
revoke all on function public.p309_claim_tap_compensation(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.p309_claim_tap_compensation(uuid,integer,integer) to service_role;
revoke all on function public.p309_attach_tap_compensation(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.p309_attach_tap_compensation(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.p309_reconcile_tap_compensation(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.p309_reconcile_tap_compensation(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.p309_complete_tap_compensation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.p309_complete_tap_compensation(uuid,uuid,uuid) to service_role;
revoke all on function public.p309_claim_tap_refund_recovery(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.p309_claim_tap_refund_recovery(uuid,integer,integer) to service_role;
revoke all on function public.p309_complete_tap_refund_recovery(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.p309_complete_tap_refund_recovery(uuid,uuid,uuid) to service_role;
revoke all on function public.p309_reconcile_claimed_refund(uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.p309_reconcile_claimed_refund(uuid,text,text,uuid,uuid) to service_role;
revoke all on function public.p309_get_refund_result(uuid) from public,anon,authenticated;
grant execute on function public.p309_get_refund_result(uuid) to service_role;
revoke all on function public.p309_reserve_refund_effect(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.p309_reserve_refund_effect(uuid,text,text,uuid) to service_role;
revoke all on function public.p309_attach_refund_effect_recovery(uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.p309_attach_refund_effect_recovery(uuid,text,text,uuid,uuid) to service_role;

commit;
