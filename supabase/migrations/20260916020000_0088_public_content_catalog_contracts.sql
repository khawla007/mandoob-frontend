-- P3.04 — source-attributed public catalog and durable content-operation contracts.
-- This migration intentionally inserts no UAE authority, activity, licence, package, or price facts.

create table public.catalog_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 2 and 160),
  source_owner text not null check (length(btrim(source_owner)) between 2 and 160),
  source_url text,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.catalog_sources(id) on delete restrict,
  version_key text not null check (length(btrim(version_key)) between 1 and 80),
  version_number bigint not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  effective_from date not null,
  effective_to date,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  supersedes_id uuid references public.catalog_versions(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_versions_effective_range check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint catalog_versions_publication_check check (
    status <> 'published' or (approved_at is not null and published_at is not null)
  ),
  unique (source_id, version_key),
  unique (source_id, version_number)
);

create table public.catalog_authorities (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 2 and 160),
  jurisdiction text not null check (jurisdiction in ('mainland', 'free_zone', 'offshore')),
  emirate text,
  summary text,
  official_url text,
  availability text not null default 'available' check (
    availability in ('available', 'disabled', 'unavailable')
  ),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_version_id, slug)
);

create table public.catalog_activities (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  code text,
  name text not null check (length(btrim(name)) between 2 and 200),
  category text,
  availability text not null default 'available' check (
    availability in ('available', 'disabled', 'unavailable')
  ),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_version_id, slug)
);

create table public.catalog_licence_types (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 2 and 160),
  description text,
  availability text not null default 'available' check (
    availability in ('available', 'disabled', 'unavailable')
  ),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_version_id, slug)
);

create table public.catalog_authority_activities (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions(id) on delete cascade,
  authority_id uuid not null references public.catalog_authorities(id) on delete cascade,
  activity_id uuid not null references public.catalog_activities(id) on delete cascade,
  licence_type_id uuid references public.catalog_licence_types(id) on delete restrict,
  eligibility_state text not null check (
    eligibility_state in ('eligible', 'ineligible', 'approval_required', 'unavailable')
  ),
  eligibility_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_version_id, authority_id, activity_id, licence_type_id)
);

create table public.catalog_packages (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions(id) on delete cascade,
  authority_id uuid not null references public.catalog_authorities(id) on delete cascade,
  licence_type_id uuid references public.catalog_licence_types(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 2 and 180),
  summary text,
  availability text not null default 'available' check (
    availability in ('available', 'disabled', 'unavailable')
  ),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_version_id, authority_id, slug)
);

create table public.catalog_package_prices (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions(id) on delete cascade,
  package_id uuid not null references public.catalog_packages(id) on delete cascade,
  price_state text not null check (price_state in ('priced', 'on_request', 'unavailable')),
  amount_minor bigint,
  currency text not null default 'AED' check (currency = 'AED'),
  recurrence text not null check (recurrence in ('one_time', 'annual')),
  inclusions text[] not null default '{}',
  exclusions text[] not null default '{}',
  effective_from date not null,
  effective_to date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_package_prices_amount check (
    (price_state = 'priced' and amount_minor is not null and amount_minor >= 0)
    or (price_state <> 'priced' and amount_minor is null)
  ),
  constraint catalog_package_prices_effective_range check (
    effective_to is null or effective_to >= effective_from
  ),
  unique (catalog_version_id, package_id, recurrence, effective_from)
);

create table public.content_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  operation_kind text not null check (length(btrim(operation_kind)) between 2 and 80),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  entity_type text not null,
  entity_id uuid,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (actor_id, operation_id)
);

create table public.content_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  action text not null check (length(btrim(action)) between 2 and 100),
  entity_type text not null,
  entity_id uuid,
  previous_version bigint,
  next_version bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (actor_id, operation_id, action)
);

alter table public.cost_data
  add column if not exists source_id uuid references public.catalog_sources(id) on delete restrict,
  add column if not exists catalog_version_id uuid references public.catalog_versions(id) on delete restrict,
  add column if not exists catalog_authority_id uuid references public.catalog_authorities(id) on delete restrict,
  add column if not exists row_version bigint not null default 1 check (row_version > 0);

comment on column public.cost_data.source_id is
  'Required for approved public use; rows without a reviewed source are not authoritative.';

-- Preserve legacy rows for operator review, but never expose seeded/demo amounts as authoritative.
update public.cost_data
   set active = false
 where source_id is null
   and active = true;

create index catalog_versions_public_lookup_idx
  on public.catalog_versions(status, effective_from, effective_to, source_id, version_number desc, id);
create index catalog_authorities_public_lookup_idx
  on public.catalog_authorities(jurisdiction, availability, sort_order, slug, id);
create index catalog_activities_public_lookup_idx
  on public.catalog_activities(availability, sort_order, slug, id);
create index catalog_packages_public_lookup_idx
  on public.catalog_packages(authority_id, availability, sort_order, slug, id);
create index catalog_package_prices_public_lookup_idx
  on public.catalog_package_prices(package_id, effective_from, effective_to, sort_order, id);
create index cost_data_public_catalog_lookup_idx
  on public.cost_data(catalog_version_id, source_id, catalog_authority_id, active, valid_from, valid_to, fee_type, id);
create index content_audit_events_entity_idx
  on public.content_audit_events(entity_type, entity_id, created_at desc, id);

alter table public.catalog_sources enable row level security;
alter table public.catalog_versions enable row level security;
alter table public.catalog_authorities enable row level security;
alter table public.catalog_activities enable row level security;
alter table public.catalog_licence_types enable row level security;
alter table public.catalog_authority_activities enable row level security;
alter table public.catalog_packages enable row level security;
alter table public.catalog_package_prices enable row level security;
alter table public.content_operation_receipts enable row level security;
alter table public.content_audit_events enable row level security;

revoke all on table public.content_operation_receipts from public, anon, authenticated;
revoke all on table public.content_audit_events from public, anon, authenticated;
grant all on table public.content_operation_receipts to service_role;
grant all on table public.content_audit_events to service_role;

grant select on table public.catalog_sources to anon, authenticated;
grant select on table public.catalog_versions to anon, authenticated;
grant select on table public.catalog_authorities to anon, authenticated;
grant select on table public.catalog_activities to anon, authenticated;
grant select on table public.catalog_licence_types to anon, authenticated;
grant select on table public.catalog_authority_activities to anon, authenticated;
grant select on table public.catalog_packages to anon, authenticated;
grant select on table public.catalog_package_prices to anon, authenticated;
grant all on table public.catalog_sources to service_role;
grant all on table public.catalog_versions to service_role;
grant all on table public.catalog_authorities to service_role;
grant all on table public.catalog_activities to service_role;
grant all on table public.catalog_licence_types to service_role;
grant all on table public.catalog_authority_activities to service_role;
grant all on table public.catalog_packages to service_role;
grant all on table public.catalog_package_prices to service_role;

create policy catalog_sources_public_read_approved on public.catalog_sources for select
  using (approved_at is not null);

create policy catalog_versions_public_read_published on public.catalog_versions for select
  using (
    status = 'published'
    and approved_at is not null
    and published_at is not null
    and effective_from <= current_date
    and (effective_to is null or effective_to >= current_date)
    and exists (
      select 1 from public.catalog_sources source
       where source.id = catalog_versions.source_id
         and source.approved_at is not null
    )
  );

create or replace function public.catalog_version_is_public(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.catalog_versions version
      join public.catalog_sources source on source.id = version.source_id
     where version.id = p_version_id
       and version.status = 'published'
       and version.approved_at is not null
       and version.published_at is not null
       and source.approved_at is not null
       and version.effective_from <= current_date
       and (version.effective_to is null or version.effective_to >= current_date)
  );
$$;
revoke all on function public.catalog_version_is_public(uuid) from public;
grant execute on function public.catalog_version_is_public(uuid) to anon, authenticated, service_role;

create or replace function public.cost_data_version_is_public(
  p_version_id uuid,
  p_source_id uuid,
  p_authority_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.catalog_versions version
      join public.catalog_sources source on source.id = version.source_id
      join public.catalog_authorities authority
        on authority.id = p_authority_id
       and authority.catalog_version_id = version.id
     where version.id = p_version_id
       and version.source_id = p_source_id
       and version.status = 'published'
       and version.approved_at is not null
       and version.published_at is not null
       and source.approved_at is not null
       and authority.availability = 'available'
       and version.effective_from <= current_date
       and (version.effective_to is null or version.effective_to >= current_date)
  );
$$;
revoke all on function public.cost_data_version_is_public(uuid, uuid, uuid) from public;
grant execute on function public.cost_data_version_is_public(uuid, uuid, uuid)
  to anon, authenticated, service_role;

grant select on table public.cost_data to anon;
drop policy if exists cost_data_admin_all on public.cost_data;
drop policy if exists cost_data_public_read_approved on public.cost_data;
create policy cost_data_public_read_approved on public.cost_data for select
  using (
    active = true
    and source_id is not null
    and catalog_version_id is not null
    and catalog_authority_id is not null
    and valid_from <= current_date
    and (valid_to is null or valid_to >= current_date)
    and public.cost_data_version_is_public(catalog_version_id, source_id, catalog_authority_id)
  );

create policy catalog_authorities_public_read on public.catalog_authorities for select
  using (availability = 'available' and public.catalog_version_is_public(catalog_version_id));
create policy catalog_activities_public_read on public.catalog_activities for select
  using (availability = 'available' and public.catalog_version_is_public(catalog_version_id));
create policy catalog_licence_types_public_read on public.catalog_licence_types for select
  using (availability = 'available' and public.catalog_version_is_public(catalog_version_id));
create policy catalog_authority_activities_public_read on public.catalog_authority_activities for select
  using (eligibility_state <> 'unavailable' and public.catalog_version_is_public(catalog_version_id));
create policy catalog_packages_public_read on public.catalog_packages for select
  using (availability = 'available' and public.catalog_version_is_public(catalog_version_id));
create policy catalog_package_prices_public_read on public.catalog_package_prices for select
  using (
    effective_from <= current_date
    and (effective_to is null or effective_to >= current_date)
    and public.catalog_version_is_public(catalog_version_id)
  );

create or replace function public.mutate_cost_data(
  p_actor_id uuid,
  p_operation_id uuid,
  p_action text,
  p_entity_id uuid,
  p_expected_version bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(convert_to(p_action || ':' || coalesce(p_entity_id::text, '') || ':' || p_payload::text, 'UTF8'), 'sha256'), 'hex');
  v_receipt public.content_operation_receipts%rowtype;
  v_previous public.cost_data%rowtype;
  v_candidate public.cost_data%rowtype;
  v_next public.cost_data%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_id::text || ':' || p_operation_id::text, 0));
  if not exists (
    select 1 from public.profiles
     where id = p_actor_id and status = 'active' and role in ('super_admin', 'admin')
  ) then
    raise exception 'forbidden';
  end if;

  select * into v_receipt
    from public.content_operation_receipts
   where actor_id = p_actor_id and operation_id = p_operation_id;
  if found then
    if v_receipt.request_hash <> v_hash then raise exception 'operation_id_conflict'; end if;
    return v_receipt.result;
  end if;

  if p_action = 'create' then
    v_candidate := pg_catalog.jsonb_populate_record(null::public.cost_data, p_payload);
    insert into public.cost_data (
      jurisdiction, authority, emirate, activity_key, fee_type, label, amount_minor, currency,
      recurrence, min_shareholders, max_shareholders, min_visas, max_visas, timeline_min_days,
      timeline_max_days, required_document_keys, estimate_grade, active, valid_from, valid_to,
      source_id, catalog_version_id, catalog_authority_id
    ) values (
      v_candidate.jurisdiction, v_candidate.authority, v_candidate.emirate,
      v_candidate.activity_key, v_candidate.fee_type, v_candidate.label,
      v_candidate.amount_minor, v_candidate.currency, v_candidate.recurrence,
      v_candidate.min_shareholders, v_candidate.max_shareholders, v_candidate.min_visas,
      v_candidate.max_visas, v_candidate.timeline_min_days, v_candidate.timeline_max_days,
      v_candidate.required_document_keys, v_candidate.estimate_grade, v_candidate.active,
      v_candidate.valid_from, v_candidate.valid_to, v_candidate.source_id,
      v_candidate.catalog_version_id, v_candidate.catalog_authority_id
    ) returning * into v_next;
  elsif p_action in ('update', 'toggle') then
    select * into v_previous from public.cost_data where id = p_entity_id for update;
    if not found then raise exception 'not_found'; end if;
    if p_expected_version is null or v_previous.row_version <> p_expected_version then
      raise exception 'stale_version';
    end if;
    if p_action = 'toggle' then
      update public.cost_data
         set active = (p_payload ->> 'active')::boolean,
             row_version = row_version + 1
       where id = p_entity_id returning * into v_next;
    else
      v_candidate := pg_catalog.jsonb_populate_record(null::public.cost_data, p_payload);
      update public.cost_data set
        jurisdiction = v_candidate.jurisdiction, authority = v_candidate.authority,
        emirate = v_candidate.emirate, activity_key = v_candidate.activity_key,
        fee_type = v_candidate.fee_type, label = v_candidate.label,
        amount_minor = v_candidate.amount_minor, currency = v_candidate.currency,
        recurrence = v_candidate.recurrence, min_shareholders = v_candidate.min_shareholders,
        max_shareholders = v_candidate.max_shareholders, min_visas = v_candidate.min_visas,
        max_visas = v_candidate.max_visas, timeline_min_days = v_candidate.timeline_min_days,
        timeline_max_days = v_candidate.timeline_max_days,
        required_document_keys = v_candidate.required_document_keys,
        estimate_grade = v_candidate.estimate_grade, active = v_candidate.active,
        valid_from = v_candidate.valid_from, valid_to = v_candidate.valid_to,
        source_id = v_candidate.source_id, catalog_version_id = v_candidate.catalog_version_id,
        catalog_authority_id = v_candidate.catalog_authority_id,
        row_version = row_version + 1
       where id = p_entity_id returning * into v_next;
    end if;
  else
    raise exception 'invalid_action';
  end if;

  insert into public.content_audit_events (
    actor_id, operation_id, action, entity_type, entity_id, previous_version, next_version
  ) values (
    p_actor_id, p_operation_id, 'cost_data.' || p_action, 'cost_data', v_next.id,
    case when p_action = 'create' then null else v_previous.row_version end, v_next.row_version
  );
  v_result := pg_catalog.jsonb_build_object('id', v_next.id, 'row_version', v_next.row_version);
  insert into public.content_operation_receipts (
    actor_id, operation_id, operation_kind, request_hash, entity_type, entity_id, result
  ) values (p_actor_id, p_operation_id, 'cost_data.' || p_action, v_hash, 'cost_data', v_next.id, v_result);
  return v_result;
end;
$$;

create or replace function public.import_cost_data(
  p_actor_id uuid,
  p_operation_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(convert_to(p_rows::text, 'UTF8'), 'sha256'), 'hex');
  v_receipt public.content_operation_receipts%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_id::text || ':' || p_operation_id::text, 0));
  if not exists (
    select 1 from public.profiles
     where id = p_actor_id and status = 'active' and role in ('super_admin', 'admin')
  ) then raise exception 'forbidden'; end if;
  select * into v_receipt from public.content_operation_receipts
   where actor_id = p_actor_id and operation_id = p_operation_id;
  if found then
    if v_receipt.request_hash <> v_hash then raise exception 'operation_id_conflict'; end if;
    return v_receipt.result;
  end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' or pg_catalog.jsonb_array_length(p_rows) not between 1 and 1000 then
    raise exception 'invalid_import_size';
  end if;

  with imported as (
    insert into public.cost_data (
      jurisdiction, authority, emirate, activity_key, fee_type, label, amount_minor, currency,
      recurrence, min_shareholders, max_shareholders, min_visas, max_visas, timeline_min_days,
      timeline_max_days, required_document_keys, estimate_grade, active, valid_from, valid_to,
      source_id, catalog_version_id, catalog_authority_id
    ) select jurisdiction, authority, emirate, activity_key, fee_type, label, amount_minor, currency,
      recurrence, min_shareholders, max_shareholders, min_visas, max_visas, timeline_min_days,
      timeline_max_days, required_document_keys, estimate_grade, active, valid_from, valid_to,
      source_id, catalog_version_id, catalog_authority_id
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        jurisdiction text, authority text, emirate text, activity_key text, fee_type text,
        label text, amount_minor integer, currency text, recurrence text, min_shareholders integer,
        max_shareholders integer, min_visas integer, max_visas integer, timeline_min_days integer,
        timeline_max_days integer, required_document_keys text[], estimate_grade boolean,
        active boolean, valid_from date, valid_to date, source_id uuid,
        catalog_version_id uuid, catalog_authority_id uuid
      ) returning id, row_version
  ), audited as (
    insert into public.content_audit_events (
      actor_id, operation_id, action, entity_type, entity_id, next_version, metadata
    ) select p_actor_id, p_operation_id, 'cost_data.import.' || id::text, 'cost_data', id, row_version,
      pg_catalog.jsonb_build_object('batch_operation_id', p_operation_id) from imported
    returning entity_id
  ) select pg_catalog.jsonb_build_object('inserted', count(*)) into v_result from audited;

  insert into public.content_operation_receipts (
    actor_id, operation_id, operation_kind, request_hash, entity_type, result
  ) values (p_actor_id, p_operation_id, 'cost_data.import', v_hash, 'cost_data_batch', v_result);
  return v_result;
end;
$$;

revoke all on function public.mutate_cost_data(uuid, uuid, text, uuid, bigint, jsonb) from public;
revoke all on function public.import_cost_data(uuid, uuid, jsonb) from public;
grant execute on function public.mutate_cost_data(uuid, uuid, text, uuid, bigint, jsonb) to service_role;
grant execute on function public.import_cost_data(uuid, uuid, jsonb) to service_role;

-- Service-role application mutations still require the fresh active operator and AAL2 checks
-- at the server-action boundary; no direct authenticated write grant is introduced here.
