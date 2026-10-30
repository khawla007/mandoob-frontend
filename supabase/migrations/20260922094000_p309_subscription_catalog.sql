-- P3.09 subscription catalog and entitlement ledger.
-- Catalog content is immutable after activation. Provider enablement is a separate decision.

create table public.subscription_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  catalog_key text not null unique check (catalog_key ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  label text not null check (char_length(label) between 1 and 120),
  catalog_class text not null check (catalog_class in ('demo','local','commercial')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  state text not null default 'draft' check (state in ('draft','active','retired')),
  revision integer not null default 1 check (revision > 0),
  effective_from timestamptz,
  effective_to timestamptz,
  cloned_from uuid references public.subscription_catalog_versions(id) on delete restrict,
  review_reference text,
  created_by uuid references public.profiles(id) on delete restrict,
  activated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'draft' and effective_from is null) or (state <> 'draft' and effective_from is not null)),
  check (effective_to is null or effective_from < effective_to)
);

create table public.subscription_plan_prices (
  catalog_version_id uuid not null references public.subscription_catalog_versions(id) on delete cascade,
  plan_key text not null check (plan_key in ('starter','professional','enterprise')),
  cadence text not null check (cadence in ('monthly','annual')),
  amount_minor bigint not null check (amount_minor >= 0),
  primary key (catalog_version_id, plan_key, cadence)
);

create table public.subscription_plan_allowances (
  catalog_version_id uuid not null references public.subscription_catalog_versions(id) on delete cascade,
  plan_key text not null check (plan_key in ('starter','professional','enterprise')),
  allowance_key text not null check (allowance_key in ('employees','storage_bytes','invoices','sms','whatsapp','advanced_reports')),
  allowance_value bigint not null check (allowance_value >= 0),
  primary key (catalog_version_id, plan_key, allowance_key)
);

create table public.subscription_addons (
  catalog_version_id uuid not null references public.subscription_catalog_versions(id) on delete cascade,
  addon_key text not null check (addon_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  allowance_key text not null check (allowance_key in ('employees','storage_bytes','sms','whatsapp')),
  allowance_delta bigint not null check (allowance_delta > 0),
  monthly_amount_minor bigint not null check (monthly_amount_minor >= 0),
  annual_amount_minor bigint not null check (annual_amount_minor >= 0),
  primary key (catalog_version_id, addon_key)
);

create table public.subscription_provider_enablement (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.subscription_catalog_versions(id) on delete cascade,
  provider text not null check (provider in ('stripe','tap')),
  destination text not null check (destination in ('local','test','sandbox','live','production')),
  enabled boolean not null default false,
  review_reference text not null check (char_length(review_reference) between 3 and 120),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (catalog_version_id, provider, destination)
);

create table public.subscription_provider_price_mappings (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.subscription_catalog_versions(id) on delete cascade,
  provider text not null check (provider = 'stripe'),
  destination text not null check (destination in ('test','sandbox','live','production')),
  plan_key text not null check (plan_key in ('starter','professional','enterprise')),
  cadence text not null check (cadence in ('monthly','annual')),
  provider_price_id text not null check (char_length(provider_price_id) between 1 and 255),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor >= 0),
  interval text not null check (interval in ('month','year')),
  unique (provider, destination, provider_price_id),
  unique (catalog_version_id, provider, destination, plan_key, cadence)
);

alter table public.subscriptions
  add column if not exists catalog_version_id uuid references public.subscription_catalog_versions(id) on delete restrict,
  add column if not exists cadence text check (cadence in ('monthly','annual')),
  add column if not exists grace_until timestamptz;

update public.subscriptions set cadence = case interval when 'month' then 'monthly' when 'year' then 'annual' end
where cadence is null;

create table public.subscription_addon_assignments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  catalog_version_id uuid not null references public.subscription_catalog_versions(id) on delete restrict,
  addon_key text not null,
  quantity integer not null check (quantity > 0),
  effective_from timestamptz not null,
  effective_to timestamptz,
  foreign key (catalog_version_id, addon_key) references public.subscription_addons(catalog_version_id, addon_key) on delete restrict,
  check (effective_to is null or effective_from < effective_to)
);

create table public.subscription_period_snapshots (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  catalog_version_id uuid not null references public.subscription_catalog_versions(id) on delete restrict,
  plan_key text not null check (plan_key in ('starter','professional','enterprise')),
  cadence text not null check (cadence in ('monthly','annual')),
  subscription_status text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  grace_until timestamptz,
  allowances jsonb not null,
  addon_deltas jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (subscription_id, period_start, period_end),
  check (period_start < period_end),
  check (jsonb_typeof(allowances) = 'object' and jsonb_typeof(addon_deltas) = 'object')
);

create table public.subscription_usage (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.subscription_period_snapshots(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  allowance_key text not null check (allowance_key in ('employees','storage_bytes','invoices','sms','whatsapp','advanced_reports','finance_exports')),
  amount bigint not null check (amount > 0),
  source text not null check (source ~ '^[a-z][a-z0-9_]{0,31}$'),
  source_id uuid,
  operation_id uuid not null unique,
  created_at timestamptz not null default now()
);

create table public.subscription_allowance_operations (
  operation_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  allowance_key text not null,
  amount bigint not null,
  source text not null,
  source_id uuid,
  status text not null check (status in ('allowed','limit_reached','provider_unavailable')),
  snapshot_id uuid references public.subscription_period_snapshots(id) on delete restrict,
  used bigint not null default 0,
  allowance_limit bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.subscription_catalog_commands (
  operation_id uuid primary key,
  command text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  version_id uuid not null references public.subscription_catalog_versions(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index subscription_usage_snapshot_allowance_idx on public.subscription_usage(snapshot_id, allowance_key);
create index subscription_period_snapshots_tenant_period_idx on public.subscription_period_snapshots(tenant_id, period_start, period_end);
create index subscription_addon_assignments_period_idx on public.subscription_addon_assignments(subscription_id, effective_from, effective_to);

alter table public.subscription_catalog_versions enable row level security;
alter table public.subscription_plan_prices enable row level security;
alter table public.subscription_plan_allowances enable row level security;
alter table public.subscription_addons enable row level security;
alter table public.subscription_provider_enablement enable row level security;
alter table public.subscription_provider_price_mappings enable row level security;
alter table public.subscription_addon_assignments enable row level security;
alter table public.subscription_period_snapshots enable row level security;
alter table public.subscription_usage enable row level security;
alter table public.subscription_allowance_operations enable row level security;
alter table public.subscription_catalog_commands enable row level security;

create or replace function public.p309_validate_catalog_provider_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_class text;
begin
  select catalog_class into v_class from public.subscription_catalog_versions where id = new.catalog_version_id;
  if new.enabled and v_class = 'demo' and new.destination in ('live','production') then
    raise exception 'LIVE_DEMO_FORBIDDEN' using errcode = 'P3098';
  end if;
  if new.enabled and v_class = 'local' and new.destination = 'production' then
    raise exception 'PRODUCTION_LOCAL_FORBIDDEN' using errcode = 'P3098';
  end if;
  return new;
end $$;

create trigger subscription_provider_enablement_policy before insert or update on public.subscription_provider_enablement
for each row execute function public.p309_validate_catalog_provider_policy();

create or replace function public.p309_validate_stripe_price_mapping()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_currency text; v_amount bigint;
begin
  select c.currency, p.amount_minor into v_currency, v_amount
  from public.subscription_catalog_versions c
  join public.subscription_plan_prices p on p.catalog_version_id = c.id
  where c.id = new.catalog_version_id and p.plan_key = new.plan_key and p.cadence = new.cadence;
  if v_currency is null or new.currency <> v_currency or new.amount_minor <> v_amount
     or new.interval <> (case new.cadence when 'monthly' then 'month' else 'year' end) then
    raise exception 'STRIPE_PRICE_MAPPING_MISMATCH' using errcode = 'P3098';
  end if;
  return new;
end $$;

create trigger subscription_stripe_price_mapping_exact before insert or update on public.subscription_provider_price_mappings
for each row execute function public.p309_validate_stripe_price_mapping();

create or replace function public.p309_guard_active_catalog_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'active' then raise exception 'ACTIVE_IMMUTABLE' using errcode = 'P3099'; end if;
    return old;
  end if;
  if old.state = 'active' and (old.catalog_key is distinct from new.catalog_key
     or old.label is distinct from new.label
     or old.catalog_class is distinct from new.catalog_class
     or old.currency is distinct from new.currency) then
    raise exception 'ACTIVE_IMMUTABLE' using errcode = 'P3099';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger subscription_catalog_active_immutable before update or delete on public.subscription_catalog_versions
for each row execute function public.p309_guard_active_catalog_version();

create or replace function public.p309_guard_active_catalog_child()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_catalog_id uuid;
begin
  if tg_op = 'INSERT' then v_catalog_id := new.catalog_version_id; else v_catalog_id := old.catalog_version_id; end if;
  if exists(select 1 from public.subscription_catalog_versions where id=v_catalog_id and state='active') then
    raise exception 'ACTIVE_IMMUTABLE' using errcode = 'P3099';
  end if;
  if tg_op = 'UPDATE' and new.catalog_version_id is distinct from old.catalog_version_id
     and exists(select 1 from public.subscription_catalog_versions where id=new.catalog_version_id and state='active') then
    raise exception 'ACTIVE_IMMUTABLE' using errcode = 'P3099';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger subscription_prices_active_immutable before insert or update or delete on public.subscription_plan_prices
for each row execute function public.p309_guard_active_catalog_child();
create trigger subscription_allowances_active_immutable before insert or update or delete on public.subscription_plan_allowances
for each row execute function public.p309_guard_active_catalog_child();
create trigger subscription_addons_active_immutable before insert or update or delete on public.subscription_addons
for each row execute function public.p309_guard_active_catalog_child();

create or replace function public.p309_require_catalog_actor(p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role::text in ('admin','super_admin') and status::text = 'active' and tenant_id is null) then
    raise exception 'FORBIDDEN' using errcode = 'P3094';
  end if;
end $$;

create or replace function public.p309_clone_subscription_catalog(
  p_actor_id uuid, p_operation_id uuid, p_source_version_id uuid, p_catalog_key text,
  p_label text, p_review_reference text, p_payload_hash text
) returns table(version_id uuid, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_existing public.subscription_catalog_commands%rowtype; v_source public.subscription_catalog_versions%rowtype;
begin
  perform public.p309_require_catalog_actor(p_actor_id);
  if char_length(trim(p_review_reference)) < 3 then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select * into v_existing from public.subscription_catalog_commands where operation_id = p_operation_id;
  if found then
    if v_existing.command <> 'clone' or v_existing.payload_hash <> p_payload_hash then raise exception 'OPERATION_REUSED' using errcode='P3099'; end if;
    return query select v_existing.version_id, true; return;
  end if;
  select * into v_source from public.subscription_catalog_versions where id = p_source_version_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  insert into public.subscription_catalog_versions(catalog_key,label,catalog_class,currency,cloned_from,review_reference,created_by)
  values(p_catalog_key,trim(p_label),v_source.catalog_class,v_source.currency,v_source.id,trim(p_review_reference),p_actor_id) returning id into v_id;
  insert into public.subscription_plan_prices select v_id,plan_key,cadence,amount_minor from public.subscription_plan_prices where catalog_version_id=v_source.id;
  insert into public.subscription_plan_allowances select v_id,plan_key,allowance_key,allowance_value from public.subscription_plan_allowances where catalog_version_id=v_source.id;
  insert into public.subscription_addons select v_id,addon_key,allowance_key,allowance_delta,monthly_amount_minor,annual_amount_minor from public.subscription_addons where catalog_version_id=v_source.id;
  insert into public.subscription_catalog_commands values(p_operation_id,'clone',p_actor_id,p_payload_hash,v_id,now());
  return query select v_id,false;
end $$;

create or replace function public.p309_edit_subscription_catalog(
  p_actor_id uuid, p_operation_id uuid, p_version_id uuid, p_expected_revision integer,
  p_label text, p_review_reference text, p_payload_hash text
) returns table(version_id uuid, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare v_row public.subscription_catalog_versions%rowtype; v_existing public.subscription_catalog_commands%rowtype;
begin
  perform public.p309_require_catalog_actor(p_actor_id);
  if char_length(trim(p_review_reference)) < 3 then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select * into v_existing from public.subscription_catalog_commands where operation_id=p_operation_id;
  if found then
    if v_existing.command <> 'edit' or v_existing.payload_hash <> p_payload_hash then raise exception 'OPERATION_REUSED' using errcode='P3099'; end if;
    return query select v_existing.version_id,true; return;
  end if;
  select * into v_row from public.subscription_catalog_versions where id=p_version_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if v_row.state <> 'draft' then raise exception 'ACTIVE_IMMUTABLE' using errcode='P3099'; end if;
  if v_row.revision <> p_expected_revision then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  update public.subscription_catalog_versions set label=trim(p_label),review_reference=trim(p_review_reference),revision=revision+1,updated_at=now() where id=p_version_id;
  insert into public.subscription_catalog_commands values(p_operation_id,'edit',p_actor_id,p_payload_hash,p_version_id,now());
  return query select p_version_id,false;
end $$;

create or replace function public.p309_activate_subscription_catalog(
  p_actor_id uuid, p_operation_id uuid, p_version_id uuid, p_expected_revision integer,
  p_effective_from timestamptz, p_review_reference text, p_payload_hash text
) returns table(version_id uuid, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare v_row public.subscription_catalog_versions%rowtype; v_existing public.subscription_catalog_commands%rowtype;
begin
  perform public.p309_require_catalog_actor(p_actor_id);
  if char_length(trim(p_review_reference)) < 3 then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select * into v_existing from public.subscription_catalog_commands where operation_id=p_operation_id;
  if found then
    if v_existing.command <> 'activate' or v_existing.payload_hash <> p_payload_hash then raise exception 'OPERATION_REUSED' using errcode='P3099'; end if;
    return query select v_existing.version_id,true; return;
  end if;
  lock table public.subscription_catalog_versions in share row exclusive mode;
  select * into v_row from public.subscription_catalog_versions where id=p_version_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if v_row.state <> 'draft' then raise exception 'ACTIVE_IMMUTABLE' using errcode='P3099'; end if;
  if v_row.revision <> p_expected_revision then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  if exists(select 1 from public.subscription_catalog_versions c where c.state='active' and c.currency=v_row.currency and tstzrange(c.effective_from,coalesce(c.effective_to,'infinity'),'[)') && tstzrange(p_effective_from,'infinity','[)')) then
    raise exception 'EFFECTIVE_OVERLAP' using errcode='P3099';
  end if;
  update public.subscription_catalog_versions set state='active',effective_from=p_effective_from,activated_by=p_actor_id,review_reference=trim(p_review_reference),revision=revision+1,updated_at=now() where id=p_version_id;
  insert into public.subscription_catalog_commands values(p_operation_id,'activate',p_actor_id,p_payload_hash,p_version_id,now());
  return query select p_version_id,false;
end $$;

create or replace function public.p309_consume_plan_allowance(
  p_tenant_id uuid, p_operation_id uuid, p_allowance_key text, p_amount bigint,
  p_source text, p_source_id uuid default null
) returns table(status text,snapshot_id uuid,used bigint,allowance_limit bigint,replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare v_subscription public.subscriptions%rowtype; v_snapshot public.subscription_period_snapshots%rowtype;
  v_existing public.subscription_allowance_operations%rowtype; v_limit bigint; v_used bigint; v_addons jsonb; v_allowances jsonb; v_status text;
begin
  if p_amount <= 0 or p_allowance_key not in ('employees','storage_bytes','invoices','sms','whatsapp','advanced_reports','finance_exports') or p_source !~ '^[a-z][a-z0-9_]{0,31}$' then
    raise exception 'VALIDATION_FAILED' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select * into v_existing from public.subscription_allowance_operations where operation_id=p_operation_id;
  if found then
    if v_existing.tenant_id<>p_tenant_id or v_existing.allowance_key<>p_allowance_key or v_existing.amount<>p_amount or v_existing.source<>p_source or v_existing.source_id is distinct from p_source_id then raise exception 'OPERATION_REUSED' using errcode='P3099'; end if;
    return query select v_existing.status,v_existing.snapshot_id,v_existing.used,v_existing.allowance_limit,true; return;
  end if;
  select * into v_subscription from public.subscriptions where tenant_id=p_tenant_id for update;
  if not found or v_subscription.catalog_version_id is null or v_subscription.current_period_start is null or v_subscription.current_period_end is null
     or not (v_subscription.status in ('active','trialing') or (v_subscription.status='past_due' and v_subscription.grace_until>now())) then
    insert into public.subscription_allowance_operations values(p_operation_id,p_tenant_id,p_allowance_key,p_amount,p_source,p_source_id,'provider_unavailable',null,0,0,now());
    return query select 'provider_unavailable'::text,null::uuid,0::bigint,0::bigint,false; return;
  end if;
  select coalesce(jsonb_object_agg(allowance_key,allowance_value),'{}'::jsonb) into v_allowances from public.subscription_plan_allowances where catalog_version_id=v_subscription.catalog_version_id and plan_key=v_subscription.plan;
  select coalesce(jsonb_object_agg(allowance_key,total),'{}'::jsonb) into v_addons from (
    select a.allowance_key,sum(a.allowance_delta*x.quantity)::bigint total
    from public.subscription_addon_assignments x join public.subscription_addons a on a.catalog_version_id=x.catalog_version_id and a.addon_key=x.addon_key
    where x.subscription_id=v_subscription.id and x.effective_from<v_subscription.current_period_end and (x.effective_to is null or x.effective_to>v_subscription.current_period_start)
    group by a.allowance_key
  ) q;
  insert into public.subscription_period_snapshots(subscription_id,tenant_id,catalog_version_id,plan_key,cadence,subscription_status,period_start,period_end,grace_until,allowances,addon_deltas)
  values(v_subscription.id,p_tenant_id,v_subscription.catalog_version_id,v_subscription.plan,coalesce(v_subscription.cadence,case v_subscription.interval when 'year' then 'annual' else 'monthly' end),v_subscription.status,v_subscription.current_period_start,v_subscription.current_period_end,v_subscription.grace_until,v_allowances,v_addons)
  on conflict(subscription_id,period_start,period_end) do nothing;
  select * into v_snapshot from public.subscription_period_snapshots where subscription_id=v_subscription.id and period_start=v_subscription.current_period_start and period_end=v_subscription.current_period_end for update;
  v_limit := case when p_allowance_key='finance_exports' then case coalesce((v_snapshot.allowances->>'advanced_reports')::bigint,0) when 1 then 9223372036854775807 else 0 end
                  else coalesce((v_snapshot.allowances->>p_allowance_key)::bigint,0)+coalesce((v_snapshot.addon_deltas->>p_allowance_key)::bigint,0) end;
  select coalesce(sum(amount),0) into v_used from public.subscription_usage where snapshot_id=v_snapshot.id and allowance_key=p_allowance_key;
  v_status := case when v_used+p_amount>v_limit then 'limit_reached' else 'allowed' end;
  if v_status='allowed' then insert into public.subscription_usage(snapshot_id,tenant_id,allowance_key,amount,source,source_id,operation_id) values(v_snapshot.id,p_tenant_id,p_allowance_key,p_amount,p_source,p_source_id,p_operation_id); v_used:=v_used+p_amount; end if;
  insert into public.subscription_allowance_operations values(p_operation_id,p_tenant_id,p_allowance_key,p_amount,p_source,p_source_id,v_status,v_snapshot.id,v_used,v_limit,now());
  return query select v_status,v_snapshot.id,v_used,v_limit,false;
end $$;

create or replace function public.p309_resolve_provider_price(
  p_catalog_version_id uuid,p_provider text,p_destination text,p_plan_key text,p_cadence text
) returns table(status text,provider_price_id text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.subscription_provider_enablement e where e.catalog_version_id=p_catalog_version_id and e.provider=p_provider and e.destination=p_destination and e.enabled) then return query select 'provider_unavailable'::text,null::text; return; end if;
  if p_provider='tap' then return query select 'allowed'::text,null::text; return; end if;
  return query select case when m.id is null then 'provider_unavailable' else 'allowed' end,m.provider_price_id
  from (select 1) x left join public.subscription_provider_price_mappings m on m.catalog_version_id=p_catalog_version_id and m.provider='stripe' and m.destination=p_destination and m.plan_key=p_plan_key and m.cadence=p_cadence
  left join public.subscription_catalog_versions c on c.id=p_catalog_version_id
  left join public.subscription_plan_prices p on p.catalog_version_id=p_catalog_version_id and p.plan_key=p_plan_key and p.cadence=p_cadence
  where m.id is null or (m.currency=c.currency and m.amount_minor=p.amount_minor and m.interval=case p_cadence when 'monthly' then 'month' else 'year' end);
end $$;

create or replace function public.p309_enforce_invoice_allowance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_result record;
begin
  -- Legacy subscriptions remain readable; catalog-managed subscriptions are enforced atomically.
  if exists(select 1 from public.subscriptions where tenant_id=new.tenant_id and catalog_version_id is not null) then
    select * into v_result from public.p309_consume_plan_allowance(new.tenant_id,new.id,'invoices',1,'invoice',new.id);
    if v_result.status<>'allowed' then raise exception 'PLAN_ALLOWANCE_%',upper(v_result.status) using errcode='P3098'; end if;
  end if;
  return new;
end $$;

create trigger p309_invoice_allowance before insert on public.invoices for each row execute function public.p309_enforce_invoice_allowance();

create or replace function public.p309_consume_finance_export(p_tenant_id uuid,p_operation_id uuid,p_source_id uuid default null)
returns table(status text,snapshot_id uuid,used bigint,allowance_limit bigint,replayed boolean)
language sql security definer set search_path = '' as $$
  select * from public.p309_consume_plan_allowance(p_tenant_id,p_operation_id,'finance_exports',1,'finance_export',p_source_id)
$$;

-- Exact local/test-only demo catalog. Sandbox starts disabled and needs an explicit review.
with catalog as (
  insert into public.subscription_catalog_versions(catalog_key,label,catalog_class,currency,state,effective_from,review_reference)
  values('p309-demo-aed-v1','P3.09 demo AED v1','demo','AED','draft',null,'P3.09-DEMO-SEED') returning id
), prices(plan_key,monthly,annual) as (values ('starter',19900::bigint,199000::bigint),('professional',49900,499000),('enterprise',99900,999000))
insert into public.subscription_plan_prices
select id,plan_key,cadence,amount from catalog cross join prices cross join lateral (values('monthly',monthly),('annual',annual)) x(cadence,amount);

with catalog as (select id from public.subscription_catalog_versions where catalog_key='p309-demo-aed-v1'), valueset(plan_key,employees,storage_bytes,invoices,sms,whatsapp,advanced_reports) as (
  values ('starter',25::bigint,5368709120::bigint,50::bigint,0::bigint,0::bigint,0::bigint),
         ('professional',100,26843545600,250,500,500,1),('enterprise',500,107374182400,1000,2500,2500,1)
)
insert into public.subscription_plan_allowances
select id,plan_key,allowance_key,allowance_value from catalog cross join valueset cross join lateral (values('employees',employees),('storage_bytes',storage_bytes),('invoices',invoices),('sms',sms),('whatsapp',whatsapp),('advanced_reports',advanced_reports)) x(allowance_key,allowance_value);

with catalog as (select id from public.subscription_catalog_versions where catalog_key='p309-demo-aed-v1')
insert into public.subscription_addons(
  catalog_version_id,addon_key,allowance_key,allowance_delta,monthly_amount_minor,annual_amount_minor
)
select catalog.id,x.addon_key,x.allowance_key,x.allowance_delta,x.monthly_amount_minor,x.annual_amount_minor
from catalog cross join (values
 ('employee_pack_25','employees',25::bigint,5000::bigint,50000::bigint),
 ('storage_pack_10_gib','storage_bytes',10737418240,3000,30000),
 ('sms_pack_100','sms',100,2000,20000),('whatsapp_pack_100','whatsapp',100,3000,30000)
) x(addon_key,allowance_key,allowance_delta,monthly_amount_minor,annual_amount_minor);

with catalog as (select id from public.subscription_catalog_versions where catalog_key='p309-demo-aed-v1')
insert into public.subscription_provider_enablement(catalog_version_id,provider,destination,enabled,review_reference)
select id,provider,destination,enabled,'P3.09-DEMO-SEED' from catalog cross join (values
 ('stripe','local',true),('stripe','test',true),('stripe','sandbox',false),('tap','local',true),('tap','test',true),('tap','sandbox',false)
) x(provider,destination,enabled);

update public.subscription_catalog_versions
set state='active',effective_from='2026-09-22T09:40:00Z',revision=revision+1,updated_at=now()
where catalog_key='p309-demo-aed-v1';

revoke all on public.subscription_catalog_versions,public.subscription_plan_prices,public.subscription_plan_allowances,public.subscription_addons,public.subscription_provider_enablement,public.subscription_provider_price_mappings,public.subscription_addon_assignments,public.subscription_period_snapshots,public.subscription_usage,public.subscription_allowance_operations,public.subscription_catalog_commands from public,anon,authenticated;
grant select,insert,update,delete on public.subscription_catalog_versions,public.subscription_plan_prices,public.subscription_plan_allowances,public.subscription_addons,public.subscription_provider_enablement,public.subscription_provider_price_mappings,public.subscription_addon_assignments,public.subscription_period_snapshots,public.subscription_usage,public.subscription_allowance_operations,public.subscription_catalog_commands to service_role;

revoke all on function public.p309_clone_subscription_catalog(uuid,uuid,uuid,text,text,text,text),public.p309_edit_subscription_catalog(uuid,uuid,uuid,integer,text,text,text),public.p309_activate_subscription_catalog(uuid,uuid,uuid,integer,timestamptz,text,text),public.p309_consume_plan_allowance(uuid,uuid,text,bigint,text,uuid),public.p309_resolve_provider_price(uuid,text,text,text,text),public.p309_consume_finance_export(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.p309_clone_subscription_catalog(uuid,uuid,uuid,text,text,text,text),public.p309_edit_subscription_catalog(uuid,uuid,uuid,integer,text,text,text),public.p309_activate_subscription_catalog(uuid,uuid,uuid,integer,timestamptz,text,text),public.p309_consume_plan_allowance(uuid,uuid,text,bigint,text,uuid),public.p309_resolve_provider_price(uuid,text,text,text,text),public.p309_consume_finance_export(uuid,uuid,uuid) to service_role;
