-- P3.09 authoritative Stripe subscription integration.
-- Provider effects are reserved before I/O; webhook application is replay-safe and atomic.

create table public.stripe_customer_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete restrict,
  destination text not null check (destination in ('test','sandbox','live','production')),
  stripe_customer_id text not null check (stripe_customer_id ~ '^cus_[A-Za-z0-9_]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (destination, stripe_customer_id)
);

create table public.stripe_subscription_operations (
  operation_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  operation_kind text not null check (operation_kind in ('checkout','portal','change','cancel')),
  destination text not null check (destination in ('test','sandbox','live','production')),
  catalog_version_id uuid references public.subscription_catalog_versions(id) on delete restrict,
  plan_key text check (plan_key in ('starter','professional','enterprise')),
  cadence text check (cadence in ('monthly','annual')),
  provider_price_id text,
  expected_version bigint check (expected_version is null or expected_version >= 0),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  effect_key text not null unique,
  effect_token uuid,
  state text not null default 'reserved' check (state in ('reserved','effect_unknown','attached','failed','reconciled')),
  provider_reference text,
  redirect_url text,
  failure_code text,
  recovery_lease_owner uuid,
  recovery_lease_token uuid,
  recovery_lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((operation_kind in ('checkout','change')) = (catalog_version_id is not null and plan_key is not null and cadence is not null)),
  check (redirect_url is null or provider_reference is not null)
);

create table public.stripe_provider_events (
  id uuid primary key default gen_random_uuid(),
  destination text not null check (destination in ('test','sandbox','live','production')),
  provider_event_id text not null,
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  provider_created bigint not null check (provider_created >= 0),
  event_type text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  state text not null default 'reserved' check (state in ('reserved','applied','duplicate','stale','rejected','retryable')),
  error_code text,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (destination, provider_event_id)
);

create table public.stripe_subscription_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  provider_event_id text not null,
  action text not null check (action in ('subscription_created','subscription_changed','subscription_cancelled','event_stale','event_rejected')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.subscriptions
  add column if not exists version bigint not null default 0,
  add column if not exists destination text check (destination in ('test','sandbox','live','production')),
  add column if not exists last_provider_created bigint,
  add column if not exists last_provider_event_id text,
  add column if not exists last_provider_body_hash text,
  add column if not exists pending_plan text check (pending_plan in ('starter','professional','enterprise')),
  add column if not exists pending_cadence text check (pending_cadence in ('monthly','annual')),
  add column if not exists pending_effective_at timestamptz;

create unique index subscriptions_destination_customer_unique
  on public.subscriptions(destination, stripe_customer_id);
create index stripe_operations_recovery_idx
  on public.stripe_subscription_operations(state, updated_at)
  where state in ('reserved','effect_unknown','attached');
create index stripe_events_order_idx
  on public.stripe_provider_events(destination, stripe_subscription_id, provider_created, provider_event_id, body_hash);

alter table public.stripe_customer_mappings enable row level security;
alter table public.stripe_subscription_operations enable row level security;
alter table public.stripe_provider_events enable row level security;
alter table public.stripe_subscription_audit enable row level security;

create trigger subscription_stripe_mapping_active_immutable
before insert or update or delete on public.subscription_provider_price_mappings
for each row execute function public.p309_guard_active_catalog_child();

create or replace function public.p309_reserve_stripe_operation(
  p_tenant_id uuid, p_company_id uuid, p_actor_id uuid, p_operation_id uuid, p_operation_kind text,
  p_destination text, p_catalog_version_id uuid, p_plan_key text, p_cadence text,
  p_expected_version bigint, p_payload_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.stripe_subscription_operations%rowtype; v_price text; v_effect text;
begin
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select * into v_existing from public.stripe_subscription_operations where operation_id=p_operation_id;
  if found then
    if v_existing.tenant_id<>p_tenant_id or v_existing.payload_hash<>p_payload_hash
      or v_existing.operation_kind<>p_operation_kind then
      raise exception 'OPERATION_REUSED' using errcode='P3099';
    end if;
    return pg_catalog.jsonb_build_object('operationId',v_existing.operation_id,'effectKey',v_existing.effect_key,
      'effectToken',v_existing.effect_token,'state',v_existing.state,'providerReference',v_existing.provider_reference,
      'redirectUrl',v_existing.redirect_url,'providerPriceId',v_existing.provider_price_id,'replayed',true);
  end if;
  if p_operation_kind in ('checkout','change') then
    select m.provider_price_id into v_price
    from public.subscription_provider_price_mappings m
    join public.subscription_provider_enablement e on e.catalog_version_id=m.catalog_version_id
      and e.provider='stripe' and e.destination=m.destination and e.enabled
    join public.subscription_catalog_versions c on c.id=m.catalog_version_id and c.state='active'
    where m.catalog_version_id=p_catalog_version_id and m.destination=p_destination
      and m.plan_key=p_plan_key and m.cadence=p_cadence;
    if not found then raise exception 'PROVIDER_UNAVAILABLE' using errcode='P3098'; end if;
    if exists(select 1 from public.subscription_catalog_versions where id=p_catalog_version_id
      and ((catalog_class='demo' and p_destination in ('live','production'))
        or (catalog_class='local' and p_destination='production'))) then
      raise exception 'CATALOG_DESTINATION_FORBIDDEN' using errcode='P3098';
    end if;
  elsif p_operation_kind='portal' and not exists(
    select 1 from public.stripe_customer_mappings where tenant_id=p_tenant_id and destination=p_destination
  ) then raise exception 'CUSTOMER_MAPPING_MISSING' using errcode='P3098';
  end if;
  if p_operation_kind in ('change','cancel') and not exists(
    select 1 from public.subscriptions where tenant_id=p_tenant_id and version=p_expected_version
      and destination=p_destination for update
  ) then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  v_effect := 'mandoob:stripe:'||p_operation_kind||':'||p_operation_id::text;
  insert into public.stripe_subscription_operations(operation_id,tenant_id,actor_id,operation_kind,destination,
    catalog_version_id,plan_key,cadence,provider_price_id,expected_version,payload_hash,effect_key,effect_token)
  values(p_operation_id,p_tenant_id,p_actor_id,p_operation_kind,p_destination,p_catalog_version_id,p_plan_key,
    p_cadence,v_price,p_expected_version,p_payload_hash,v_effect,gen_random_uuid()) returning * into v_existing;
  return pg_catalog.jsonb_build_object('operationId',v_existing.operation_id,'effectKey',v_effect,
    'effectToken',v_existing.effect_token,'state',v_existing.state,'providerPriceId',v_price,'replayed',false);
end $$;

create or replace function public.p309_attach_stripe_operation(
  p_operation_id uuid, p_effect_token uuid, p_provider_reference text, p_redirect_url text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.stripe_subscription_operations%rowtype;
begin
  select * into v_row from public.stripe_subscription_operations where operation_id=p_operation_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if v_row.effect_token is distinct from p_effect_token then raise exception 'EFFECT_NOT_OWNED' using errcode='P3099'; end if;
  if v_row.provider_reference is not null and v_row.provider_reference<>p_provider_reference then
    raise exception 'EFFECT_CONFLICT' using errcode='P3099';
  end if;
  update public.stripe_subscription_operations set provider_reference=p_provider_reference,
    redirect_url=p_redirect_url,state='attached',updated_at=now() where operation_id=p_operation_id returning * into v_row;
  if v_row.operation_kind='change' then
    update public.subscriptions set pending_plan=v_row.plan_key,pending_cadence=v_row.cadence,
      pending_effective_at=current_period_end,version=version+1
    where tenant_id=v_row.tenant_id and version=v_row.expected_version;
    if not found then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  end if;
  return pg_catalog.jsonb_build_object('operationId',v_row.operation_id,'effectKey',v_row.effect_key,
    'state',v_row.state,'providerReference',v_row.provider_reference,'redirectUrl',v_row.redirect_url);
end $$;

create or replace function public.p309_mark_stripe_operation_unknown(p_operation_id uuid, p_failure_code text)
returns void language sql security definer set search_path = '' as $$
  update public.stripe_subscription_operations set state='effect_unknown',failure_code=left(p_failure_code,64),updated_at=now()
  where operation_id=p_operation_id and state='reserved'
$$;

create or replace function public.p309_claim_stripe_operation_recovery(
  p_worker_id uuid, p_limit integer default 25, p_lease_seconds integer default 120
) returns setof public.stripe_subscription_operations
language plpgsql security definer set search_path = '' as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 15 and 900 then
    raise exception 'INVALID_LEASE' using errcode='22023';
  end if;
  return query with candidates as (
    select operation_id from public.stripe_subscription_operations
    where state in ('reserved','effect_unknown','attached')
      and updated_at < now()-interval '30 seconds'
      and (recovery_lease_expires_at is null or recovery_lease_expires_at<now())
    order by updated_at,operation_id for update skip locked limit p_limit
  ), claimed as (
    update public.stripe_subscription_operations operation set recovery_lease_owner=p_worker_id,
      recovery_lease_token=gen_random_uuid(),recovery_lease_expires_at=now()+pg_catalog.make_interval(secs=>p_lease_seconds)
    from candidates where operation.operation_id=candidates.operation_id returning operation.*
  ) select * from claimed;
end $$;

create or replace function public.p309_bind_stripe_customer(
  p_operation_id uuid, p_provider_reference text, p_stripe_customer_id text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_operation public.stripe_subscription_operations%rowtype;
begin
  select * into v_operation from public.stripe_subscription_operations
    where operation_id=p_operation_id and operation_kind='checkout' for update;
  if not found or v_operation.provider_reference is distinct from p_provider_reference then
    raise exception 'CHECKOUT_MAPPING_MISMATCH' using errcode='P3099';
  end if;
  insert into public.stripe_customer_mappings(tenant_id,destination,stripe_customer_id)
  values(v_operation.tenant_id,v_operation.destination,p_stripe_customer_id)
  on conflict(tenant_id) do update set stripe_customer_id=excluded.stripe_customer_id,
    destination=excluded.destination,updated_at=now()
  where public.stripe_customer_mappings.stripe_customer_id=excluded.stripe_customer_id
    and public.stripe_customer_mappings.destination=excluded.destination;
  if not found then raise exception 'CUSTOMER_MAPPING_CONFLICT' using errcode='P3099'; end if;
  update public.stripe_subscription_operations set state='reconciled',updated_at=now()
    where operation_id=p_operation_id;
  return v_operation.tenant_id;
end $$;

create or replace function public.p309_reserve_stripe_event(
  p_destination text, p_provider_event_id text, p_body_hash text, p_provider_created bigint,
  p_event_type text, p_stripe_customer_id text, p_stripe_subscription_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.stripe_provider_events%rowtype;
begin
  insert into public.stripe_provider_events(destination,provider_event_id,body_hash,provider_created,event_type,
    stripe_customer_id,stripe_subscription_id)
  values(p_destination,p_provider_event_id,p_body_hash,p_provider_created,p_event_type,p_stripe_customer_id,p_stripe_subscription_id)
  on conflict(destination,provider_event_id) do nothing returning * into v_row;
  if not found then
    select * into v_row from public.stripe_provider_events where destination=p_destination and provider_event_id=p_provider_event_id for update;
    if v_row.body_hash<>p_body_hash then raise exception 'EVENT_BODY_CONFLICT' using errcode='P3099'; end if;
  end if;
  return pg_catalog.jsonb_build_object('eventId',v_row.id,'state',v_row.state,
    'replayed',v_row.received_at is not null and v_row.state<>'reserved');
end $$;

create or replace function public.p309_apply_stripe_subscription_event(
  p_event_id uuid, p_stripe_customer_id text, p_stripe_subscription_id text, p_provider_price_id text,
  p_status text, p_period_start timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean,
  p_canceled_at timestamptz, p_amount_minor bigint, p_currency text, p_interval text, p_metadata_tenant_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.stripe_provider_events%rowtype; v_customer public.stripe_customer_mappings%rowtype;
  v_mapping public.subscription_provider_price_mappings%rowtype; v_sub public.subscriptions%rowtype;
  v_allowances jsonb; v_action text; v_event_uuid uuid := gen_random_uuid(); v_dedupe text;
  v_grace_until timestamptz;
begin
  select * into v_event from public.stripe_provider_events where id=p_event_id for update;
  if not found then raise exception 'EVENT_NOT_RESERVED' using errcode='P0001'; end if;
  if v_event.state in ('applied','duplicate','stale') then return pg_catalog.jsonb_build_object('state',v_event.state,'replayed',true); end if;
  select * into v_customer from public.stripe_customer_mappings where destination=v_event.destination
    and stripe_customer_id=p_stripe_customer_id for update;
  if not found or (p_metadata_tenant_id is not null and p_metadata_tenant_id<>v_customer.tenant_id::text) then
    update public.stripe_provider_events set state='rejected',error_code='MAPPING_MISMATCH' where id=p_event_id;
    return pg_catalog.jsonb_build_object('state','rejected','code','MAPPING_MISMATCH');
  end if;
  select m.* into v_mapping from public.subscription_provider_price_mappings m
  join public.subscription_catalog_versions c on c.id=m.catalog_version_id
    and c.state='active' and c.effective_from<=now() and (c.effective_to is null or c.effective_to>now())
  join public.subscription_provider_enablement e on e.catalog_version_id=m.catalog_version_id
    and e.provider='stripe' and e.destination=m.destination and e.enabled
  join public.subscription_plan_prices price on price.catalog_version_id=m.catalog_version_id
    and price.plan_key=m.plan_key and price.cadence=m.cadence and price.amount_minor=m.amount_minor
  where m.provider='stripe' and m.destination=v_event.destination
    and m.provider_price_id=p_provider_price_id and m.currency=c.currency
    and m.interval=case m.cadence when 'monthly' then 'month' else 'year' end
    and not (c.catalog_class='demo' and v_event.destination in ('live','production'))
    and not (c.catalog_class='local' and v_event.destination='production');
  if not found or v_mapping.amount_minor<>p_amount_minor or v_mapping.currency<>upper(p_currency)
    or v_mapping.interval<>p_interval then
    update public.stripe_provider_events set state='rejected',error_code='PRICE_MISMATCH' where id=p_event_id;
    return pg_catalog.jsonb_build_object('state','rejected','code','PRICE_MISMATCH');
  end if;
  select * into v_sub from public.subscriptions where tenant_id=v_customer.tenant_id for update;
  if found and v_sub.stripe_subscription_id<>p_stripe_subscription_id then
    update public.stripe_provider_events set state='rejected',error_code='SUBSCRIPTION_MISMATCH' where id=p_event_id;
    return pg_catalog.jsonb_build_object('state','rejected','code','SUBSCRIPTION_MISMATCH');
  end if;
  if found and (v_event.provider_created,v_event.provider_event_id,v_event.body_hash)
      <= (coalesce(v_sub.last_provider_created,-1),coalesce(v_sub.last_provider_event_id,''),coalesce(v_sub.last_provider_body_hash,'')) then
    update public.stripe_provider_events set state='stale',applied_at=now() where id=p_event_id;
    insert into public.stripe_subscription_audit(tenant_id,provider_event_id,action) values(v_customer.tenant_id,v_event.provider_event_id,'event_stale');
    return pg_catalog.jsonb_build_object('state','stale','replayed',false);
  end if;
  v_grace_until := case
    when p_status='past_due' and v_sub.status='past_due' and v_sub.grace_until is not null
      then v_sub.grace_until
    when p_status='past_due'
      then pg_catalog.to_timestamp(v_event.provider_created)+interval '7 days'
    else null
  end;
  insert into public.subscriptions(tenant_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,plan,status,
    current_period_start,current_period_end,cancel_at_period_end,canceled_at,unit_amount_minor,currency,interval,
    catalog_version_id,cadence,destination,grace_until,version,last_provider_created,last_provider_event_id,last_provider_body_hash)
  values(v_customer.tenant_id,p_stripe_customer_id,p_stripe_subscription_id,p_provider_price_id,v_mapping.plan_key,p_status,
    p_period_start,p_period_end,p_cancel_at_period_end,p_canceled_at,p_amount_minor,upper(p_currency),p_interval,
    v_mapping.catalog_version_id,v_mapping.cadence,v_event.destination,v_grace_until,1,v_event.provider_created,v_event.provider_event_id,v_event.body_hash)
  on conflict(tenant_id) do update set stripe_price_id=excluded.stripe_price_id,plan=excluded.plan,status=excluded.status,
    current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,canceled_at=excluded.canceled_at,
    unit_amount_minor=excluded.unit_amount_minor,currency=excluded.currency,interval=excluded.interval,
    catalog_version_id=excluded.catalog_version_id,cadence=excluded.cadence,destination=excluded.destination,
    grace_until=excluded.grace_until,
    pending_plan=case when public.subscriptions.pending_plan=excluded.plan
      and public.subscriptions.pending_cadence=excluded.cadence then null else public.subscriptions.pending_plan end,
    pending_cadence=case when public.subscriptions.pending_plan=excluded.plan
      and public.subscriptions.pending_cadence=excluded.cadence then null else public.subscriptions.pending_cadence end,
    pending_effective_at=case when public.subscriptions.pending_plan=excluded.plan
      and public.subscriptions.pending_cadence=excluded.cadence then null else public.subscriptions.pending_effective_at end,
    version=public.subscriptions.version+1,last_provider_created=excluded.last_provider_created,
    last_provider_event_id=excluded.last_provider_event_id,last_provider_body_hash=excluded.last_provider_body_hash;
  select pg_catalog.jsonb_object_agg(allowance_key,allowance_value) into v_allowances
    from public.subscription_plan_allowances where catalog_version_id=v_mapping.catalog_version_id and plan_key=v_mapping.plan_key;
  insert into public.subscription_period_snapshots(subscription_id,tenant_id,catalog_version_id,plan_key,cadence,
    subscription_status,period_start,period_end,grace_until,allowances)
  select id,tenant_id,catalog_version_id,plan,cadence,status,p_period_start,p_period_end,grace_until,coalesce(v_allowances,'{}'::jsonb)
    from public.subscriptions where tenant_id=v_customer.tenant_id
  on conflict(subscription_id,period_start,period_end) do update set subscription_status=excluded.subscription_status,
    grace_until=excluded.grace_until,allowances=excluded.allowances;
  v_action := case when p_status='canceled' then 'subscription_cancelled'
    when v_sub.id is null then 'subscription_created' else 'subscription_changed' end;
  insert into public.stripe_subscription_audit(tenant_id,provider_event_id,action,details)
  values(v_customer.tenant_id,v_event.provider_event_id,v_action,
    pg_catalog.jsonb_build_object('plan',v_mapping.plan_key,'cadence',v_mapping.cadence,'status',p_status));
  update public.stripe_provider_events set state='applied',applied_at=now(),stripe_customer_id=p_stripe_customer_id,
    stripe_subscription_id=p_stripe_subscription_id where id=p_event_id;
  v_dedupe:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('billing.subscription.changed:1:'||v_event.provider_event_id,'UTF8')),'hex');
  perform public.publish_domain_event(v_event_uuid,'billing.subscription.changed',1::smallint,now(),v_customer.tenant_id,
    null,null,v_event_uuid,null,'internal',pg_catalog.jsonb_build_object('subscription_id',p_stripe_subscription_id,
      'plan',v_mapping.plan_key,'status',p_status,'version',(select version from public.subscriptions where tenant_id=v_customer.tenant_id)),v_dedupe);
  return pg_catalog.jsonb_build_object('state','applied','tenantId',v_customer.tenant_id);
end $$;

insert into public.event_contract_registrations(event_type,event_version,payload_schema) values
 ('billing.subscription.changed',1,'{"subscription_id":"reference","plan":"state","status":"state","version":"integer"}')
on conflict(event_type,event_version) do update set payload_schema=excluded.payload_schema,updated_at=now();
insert into public.event_consumer_registrations(consumer_name,event_type,event_version,max_attempts,default_lease_seconds,enabled)
values('internal.billing.projection','billing.subscription.changed',1,5,120,true)
on conflict(consumer_name,event_type,event_version) do update set enabled=true,updated_at=now();

revoke all on table public.stripe_customer_mappings, public.stripe_subscription_operations,
  public.stripe_provider_events, public.stripe_subscription_audit from anon, authenticated;
grant select,insert,update on table public.stripe_customer_mappings, public.stripe_subscription_operations,
  public.stripe_provider_events, public.stripe_subscription_audit to service_role;
revoke all on function public.p309_reserve_stripe_operation(uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text),
  public.p309_attach_stripe_operation(uuid,uuid,text,text), public.p309_mark_stripe_operation_unknown(uuid,text),
  public.p309_bind_stripe_customer(uuid,text,text),
  public.p309_claim_stripe_operation_recovery(uuid,integer,integer),
  public.p309_reserve_stripe_event(text,text,text,bigint,text,text,text),
  public.p309_apply_stripe_subscription_event(uuid,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,bigint,text,text,text)
  from public, anon, authenticated;
grant execute on function public.p309_reserve_stripe_operation(uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text),
  public.p309_attach_stripe_operation(uuid,uuid,text,text), public.p309_mark_stripe_operation_unknown(uuid,text),
  public.p309_bind_stripe_customer(uuid,text,text),
  public.p309_claim_stripe_operation_recovery(uuid,integer,integer),
  public.p309_reserve_stripe_event(text,text,text,bigint,text,text,text),
  public.p309_apply_stripe_subscription_event(uuid,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,bigint,text,text,text)
  to service_role;
