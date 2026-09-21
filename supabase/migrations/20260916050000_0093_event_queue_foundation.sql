-- P3.10 event/outbox and leased-job interface foundation.
-- Provider/channel workers remain disabled until a later integration phase.
begin;

create table public.event_consumer_registrations (
  consumer_name text not null,
  event_type text not null,
  event_version smallint not null,
  max_attempts smallint not null default 5,
  default_lease_seconds integer not null default 120,
  enabled boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (consumer_name, event_type, event_version),
  constraint event_consumer_name_valid check (
    consumer_name ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    and pg_catalog.char_length(consumer_name) <= 160
  ),
  constraint event_consumer_type_valid check (
    event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    and pg_catalog.char_length(event_type) <= 160
  ),
  constraint event_consumer_version_valid check (event_version between 1 and 32767),
  constraint event_consumer_attempts_valid check (max_attempts between 1 and 25),
  constraint event_consumer_lease_valid check (default_lease_seconds between 15 and 900)
);

create table public.domain_events (
  id uuid primary key,
  event_type text not null,
  event_version smallint not null,
  occurred_at timestamptz not null,
  tenant_id uuid references public.tenants(id) on delete restrict,
  company_id uuid,
  actor_id uuid references public.profiles(id) on delete set null,
  correlation_id uuid not null,
  causation_id uuid,
  privacy_class text not null,
  payload jsonb not null,
  dedupe_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint domain_events_type_valid check (
    event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    and pg_catalog.char_length(event_type) <= 160
  ),
  constraint domain_events_version_valid check (event_version between 1 and 32767),
  constraint domain_events_ownership_valid check (company_id is null or tenant_id is not null),
  constraint domain_events_tenant_company_fkey
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete restrict,
  constraint domain_events_privacy_valid check (
    privacy_class in ('public', 'internal', 'confidential', 'restricted')
  ),
  constraint domain_events_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint domain_events_dedupe_hash check (dedupe_key ~ '^[a-f0-9]{64}$'),
  constraint domain_events_dedupe_unique unique (event_type, event_version, dedupe_key)
);

create index domain_events_tenant_occurred_idx
  on public.domain_events (tenant_id, occurred_at desc, id);
create index domain_events_company_occurred_idx
  on public.domain_events (tenant_id, company_id, occurred_at desc, id)
  where company_id is not null;
create index domain_events_correlation_idx
  on public.domain_events (correlation_id, occurred_at, id);

create table public.event_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.domain_events(id) on delete restrict,
  consumer_name text not null,
  state text not null default 'pending',
  available_at timestamptz not null default pg_catalog.now(),
  attempts smallint not null default 0,
  max_attempts smallint not null,
  lease_owner uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_category text,
  last_error_code text,
  effect_reference_hash text,
  replay_of_job_id uuid references public.event_jobs(id) on delete restrict,
  replay_request_id uuid,
  effect_key text generated always as (
    'mandoob:event-job:' || coalesce(replay_of_job_id, id)::text
  ) stored,
  succeeded_at timestamptz,
  cancelled_at timestamptz,
  dead_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint event_jobs_consumer_valid check (
    consumer_name ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    and pg_catalog.char_length(consumer_name) <= 160
  ),
  constraint event_jobs_state_valid check (
    state in ('pending', 'leased', 'succeeded', 'retryable', 'dead', 'cancelled', 'replayed')
  ),
  constraint event_jobs_attempts_valid check (
    attempts between 0 and 25 and max_attempts between 1 and 25 and attempts <= max_attempts
  ),
  constraint event_jobs_lease_shape check (
    (state = 'leased' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or (state <> 'leased' and lease_owner is null and lease_token is null and lease_expires_at is null)
  ),
  constraint event_jobs_error_shape check (
    (last_error_category is null and last_error_code is null)
    or (
      last_error_category in (
        'authentication', 'configuration', 'invalid_recipient', 'invalid_template',
        'rate_limited', 'provider_unavailable', 'timeout', 'rejected',
        'malformed_payload', 'unsupported_version', 'lease_expired', 'unknown'
      )
      and last_error_code ~ '^[A-Z][A-Z0-9_]{1,63}$'
      and pg_catalog.char_length(last_error_code) <= 64
    )
  ),
  constraint event_jobs_effect_reference_hash check (
    effect_reference_hash is null or effect_reference_hash ~ '^[a-f0-9]{64}$'
  )
);

create unique index event_jobs_initial_consumer_unique
  on public.event_jobs (event_id, consumer_name)
  where replay_of_job_id is null;
create unique index event_jobs_active_replay_unique
  on public.event_jobs (replay_of_job_id)
  where replay_of_job_id is not null
    and state in ('pending', 'leased', 'retryable', 'replayed');
create index event_jobs_due_idx
  on public.event_jobs (consumer_name, available_at, created_at, id)
  where state in ('pending', 'retryable', 'replayed');
create index event_jobs_expired_lease_idx
  on public.event_jobs (lease_expires_at, id)
  where state = 'leased';
create index event_jobs_event_idx on public.event_jobs (event_id, created_at, id);

create table public.event_job_attempts (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.event_jobs(id) on delete restrict,
  attempt_number smallint not null,
  transition text not null,
  worker_id uuid,
  lease_token uuid,
  error_category text,
  error_code text,
  effect_reference_hash text,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint event_job_attempt_number_valid check (attempt_number between 0 and 25),
  constraint event_job_attempt_transition_valid check (
    transition in ('leased', 'lease_extended', 'succeeded', 'retryable', 'dead', 'cancelled')
  ),
  constraint event_job_attempt_error_shape check (
    (error_category is null and error_code is null)
    or (
      error_category in (
        'authentication', 'configuration', 'invalid_recipient', 'invalid_template',
        'rate_limited', 'provider_unavailable', 'timeout', 'rejected',
        'malformed_payload', 'unsupported_version', 'lease_expired', 'unknown'
      )
      and error_code ~ '^[A-Z][A-Z0-9_]{1,63}$'
      and pg_catalog.char_length(error_code) <= 64
    )
  ),
  constraint event_job_attempt_effect_hash check (
    effect_reference_hash is null or effect_reference_hash ~ '^[a-f0-9]{64}$'
  )
);

create index event_job_attempts_job_idx
  on public.event_job_attempts (job_id, occurred_at, id);

create table public.event_replay_requests (
  id uuid primary key,
  source_job_id uuid not null references public.event_jobs(id) on delete restrict,
  replay_job_id uuid not null,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  reason text not null,
  requested_at timestamptz not null default pg_catalog.now(),
  constraint event_replay_reason_valid check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 8 and 240
    and reason !~* '(authorization|bearer|cookie|password|secret|token|signature|https?://|@|\+?[0-9][0-9 -]{7,})'
  ),
  constraint event_replay_operator_operation_unique unique (requested_by, operation_id),
  constraint event_replay_job_unique unique (replay_job_id)
);

alter table public.event_jobs
  add constraint event_jobs_replay_request_fkey
  foreign key (replay_request_id)
  references public.event_replay_requests(id)
  on delete restrict
  deferrable initially deferred;

alter table public.event_replay_requests
  add constraint event_replay_requests_replay_job_fkey
  foreign key (replay_job_id)
  references public.event_jobs(id)
  on delete restrict
  deferrable initially deferred;

create table public.inbound_destinations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  destination_key_hash text not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid,
  enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint inbound_destinations_provider_valid check (
    provider ~ '^[a-z][a-z0-9_-]{1,31}$'
  ),
  constraint inbound_destinations_hash_valid check (destination_key_hash ~ '^[a-f0-9]{64}$'),
  constraint inbound_destinations_tenant_company_fkey
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete restrict,
  constraint inbound_destinations_provider_key_unique unique (provider, destination_key_hash)
);

create index inbound_destinations_tenant_idx
  on public.inbound_destinations (tenant_id, provider, id);

create table public.inbound_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  destination_id uuid not null references public.inbound_destinations(id) on delete restrict,
  provider_event_id_hash text not null,
  payload_hash text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,
  status text not null default 'reserved',
  error_category text,
  error_code text,
  constraint inbound_webhook_provider_valid check (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  constraint inbound_webhook_event_hash_valid check (provider_event_id_hash ~ '^[a-f0-9]{64}$'),
  constraint inbound_webhook_payload_hash_valid check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint inbound_webhook_status_valid check (status in ('reserved', 'processed', 'rejected')),
  constraint inbound_webhook_error_shape check (
    (error_category is null and error_code is null)
    or (
      error_category in ('malformed_payload', 'unsupported_version', 'unknown')
      and error_code ~ '^[A-Z][A-Z0-9_]{1,63}$'
      and pg_catalog.char_length(error_code) <= 64
    )
  ),
  constraint inbound_webhook_provider_event_unique
    unique (provider, destination_id, provider_event_id_hash)
);

create index inbound_webhook_receipts_destination_idx
  on public.inbound_webhook_receipts (destination_id, received_at desc, id);

create table public.event_worker_heartbeats (
  worker_id uuid primary key,
  worker_name text not null,
  consumer_name text not null,
  scheduler_owner text not null,
  release_version text not null,
  started_at timestamptz not null,
  heartbeat_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint event_worker_name_valid check (
    worker_name ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint event_worker_consumer_valid check (
    consumer_name ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    and pg_catalog.char_length(consumer_name) <= 160
  ),
  constraint event_worker_scheduler_valid check (
    scheduler_owner ~ '^[a-z][a-z0-9_.-]{1,79}$'
  ),
  constraint event_worker_release_valid check (
    release_version ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$'
  ),
  constraint event_worker_time_valid check (heartbeat_at >= started_at)
);

alter table public.event_consumer_registrations enable row level security;
alter table public.domain_events enable row level security;
alter table public.event_jobs enable row level security;
alter table public.event_job_attempts enable row level security;
alter table public.event_replay_requests enable row level security;
alter table public.inbound_destinations enable row level security;
alter table public.inbound_webhook_receipts enable row level security;
alter table public.event_worker_heartbeats enable row level security;

create or replace function public.reject_event_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'EVENT_HISTORY_IMMUTABLE';
end;
$$;

create trigger domain_events_immutable
  before update or delete on public.domain_events
  for each row execute function public.reject_event_history_mutation();
create trigger event_job_attempts_immutable
  before update or delete on public.event_job_attempts
  for each row execute function public.reject_event_history_mutation();
create trigger event_replay_requests_immutable
  before update or delete on public.event_replay_requests
  for each row execute function public.reject_event_history_mutation();
create trigger inbound_webhook_receipts_no_delete
  before delete on public.inbound_webhook_receipts
  for each row execute function public.reject_event_history_mutation();

create or replace function public.event_payload_is_safe(p_payload jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
  v_scalar text;
begin
  case pg_catalog.jsonb_typeof(p_payload)
    when 'object' then
      for v_key, v_value in select key, value from pg_catalog.jsonb_each(p_payload)
      loop
        if v_key ~* '(authorization|cookie|credential|email|emirates.?id|header|message|mobile|national.?id|passport|password|phone|raw.?response|secret|signature|token)'
          or not public.event_payload_is_safe(v_value)
        then
          return false;
        end if;
      end loop;
    when 'array' then
      for v_value in select value from pg_catalog.jsonb_array_elements(p_payload)
      loop
        if not public.event_payload_is_safe(v_value) then return false; end if;
      end loop;
    when 'string' then
      v_scalar := p_payload #>> '{}';
      if v_scalar !~* '^(?:[a-f0-9]{64}|[0-9a-f]{8}-[0-9a-f-]{27,})$'
        and (
          v_scalar ~* '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}'
          or v_scalar ~ '(\+|00)[0-9][0-9 ()\.\-]{7,}[0-9]'
          or v_scalar ~* '(bearer|basic)[[:space:]]+[A-Za-z0-9._~+/=\-]+'
        )
      then
        return false;
      end if;
    else
      null;
  end case;
  return true;
end;
$$;

create or replace function public.publish_domain_event(
  p_event_id uuid,
  p_event_type text,
  p_event_version smallint,
  p_occurred_at timestamptz,
  p_tenant_id uuid,
  p_company_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_privacy_class text,
  p_payload jsonb,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.domain_events%rowtype;
begin
  if not exists (
    select 1
    from public.event_consumer_registrations registration
    where registration.event_type = p_event_type
      and registration.event_version = p_event_version
      and registration.enabled
  ) then
    raise exception using errcode = '22023', message = 'EVENT_VERSION_UNSUPPORTED';
  end if;
  if not public.event_payload_is_safe(p_payload) then
    raise exception using errcode = '22023', message = 'EVENT_PAYLOAD_REDACTION_REQUIRED';
  end if;

  insert into public.domain_events (
    id, event_type, event_version, occurred_at, tenant_id, company_id,
    actor_id, correlation_id, causation_id, privacy_class, payload, dedupe_key
  ) values (
    p_event_id, p_event_type, p_event_version, p_occurred_at, p_tenant_id, p_company_id,
    p_actor_id, p_correlation_id, p_causation_id, p_privacy_class, p_payload, p_dedupe_key
  )
  on conflict (event_type, event_version, dedupe_key) do nothing
  returning * into v_event;

  if not found then
    select * into v_event
    from public.domain_events event
    where event.event_type = p_event_type
      and event.event_version = p_event_version
      and event.dedupe_key = p_dedupe_key;

    if v_event.id is distinct from p_event_id
      or v_event.occurred_at is distinct from p_occurred_at
      or v_event.tenant_id is distinct from p_tenant_id
      or v_event.company_id is distinct from p_company_id
      or v_event.actor_id is distinct from p_actor_id
      or v_event.correlation_id is distinct from p_correlation_id
      or v_event.causation_id is distinct from p_causation_id
      or v_event.privacy_class is distinct from p_privacy_class
      or v_event.payload is distinct from p_payload
    then
      raise exception using errcode = '23505', message = 'EVENT_DEDUPE_CONFLICT';
    end if;
  end if;

  insert into public.event_jobs (event_id, consumer_name, max_attempts)
  select v_event.id, registration.consumer_name, registration.max_attempts
  from public.event_consumer_registrations registration
  where registration.event_type = v_event.event_type
    and registration.event_version = v_event.event_version
    and registration.enabled
  on conflict (event_id, consumer_name) where replay_of_job_id is null do nothing;

  return v_event.id;
end;
$$;

create or replace function public.claim_event_jobs(
  p_worker_id uuid,
  p_consumer_name text,
  p_batch_size integer default 25,
  p_lease_seconds integer default 120
)
returns table (
  job_id uuid,
  event_id uuid,
  consumer_name text,
  attempt_number smallint,
  max_attempts smallint,
  lease_token uuid,
  lease_expires_at timestamptz,
  effect_key text,
  event_type text,
  event_version smallint,
  occurred_at timestamptz,
  tenant_id uuid,
  company_id uuid,
  actor_id uuid,
  correlation_id uuid,
  causation_id uuid,
  privacy_class text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null
    or p_consumer_name is null
    or not (p_batch_size between 1 and 100)
    or not (p_lease_seconds between 15 and 900)
  then
    raise exception using errcode = '22023', message = 'INVALID_CLAIM_ARGUMENTS';
  end if;

  with exhausted as (
    update public.event_jobs job
    set state = 'dead',
        lease_owner = null,
        lease_token = null,
        lease_expires_at = null,
        dead_at = pg_catalog.now(),
        last_error_category = 'lease_expired',
        last_error_code = 'ATTEMPT_LIMIT_EXHAUSTED',
        updated_at = pg_catalog.now()
    where job.consumer_name = p_consumer_name
      and job.state = 'leased'
      and job.lease_expires_at <= pg_catalog.now()
      and job.attempts >= job.max_attempts
    returning job.id, job.attempts
  )
  insert into public.event_job_attempts (
    job_id, attempt_number, transition, error_category, error_code
  )
  select id, attempts, 'dead', 'lease_expired', 'ATTEMPT_LIMIT_EXHAUSTED'
  from exhausted;

  return query
  with candidates as (
    select job.id
    from public.event_jobs job
    where job.consumer_name = p_consumer_name
      and job.attempts < job.max_attempts
      and (
        (job.state in ('pending', 'retryable', 'replayed') and job.available_at <= pg_catalog.now())
        or (job.state = 'leased' and job.lease_expires_at <= pg_catalog.now())
      )
    order by job.available_at, job.created_at, job.id
    for update skip locked
    limit p_batch_size
  ), claimed as (
    update public.event_jobs job
    set state = 'leased',
        attempts = job.attempts + 1,
        lease_owner = p_worker_id,
        lease_token = gen_random_uuid(),
        lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
        last_error_category = null,
        last_error_code = null,
        updated_at = pg_catalog.now()
    from candidates
    where job.id = candidates.id
    returning job.*
  ), logged as (
    insert into public.event_job_attempts as attempt (
      job_id, attempt_number, transition, worker_id, lease_token
    )
    select claimed.id, claimed.attempts, 'leased', p_worker_id, claimed.lease_token
    from claimed
    returning attempt.job_id
  )
  select
    claimed.id,
    claimed.event_id,
    claimed.consumer_name,
    claimed.attempts,
    claimed.max_attempts,
    claimed.lease_token,
    claimed.lease_expires_at,
    claimed.effect_key,
    event.event_type,
    event.event_version,
    event.occurred_at,
    event.tenant_id,
    event.company_id,
    event.actor_id,
    event.correlation_id,
    event.causation_id,
    event.privacy_class,
    event.payload
  from claimed
  join logged on logged.job_id = claimed.id
  join public.domain_events event on event.id = claimed.event_id
  order by claimed.available_at, claimed.created_at, claimed.id;
end;
$$;

create or replace function public.extend_event_job_lease(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.event_jobs%rowtype;
begin
  if not (p_lease_seconds between 15 and 900) then
    raise exception using errcode = '22023', message = 'INVALID_LEASE_SECONDS';
  end if;

  update public.event_jobs job
  set lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = pg_catalog.now()
  where job.id = p_job_id
    and job.state = 'leased'
    and job.lease_owner = p_worker_id
    and job.lease_token = p_lease_token
    and job.lease_expires_at > pg_catalog.now()
  returning * into v_job;

  if not found then
    raise exception using errcode = '55000', message = 'STALE_EVENT_JOB_LEASE';
  end if;

  insert into public.event_job_attempts (
    job_id, attempt_number, transition, worker_id, lease_token
  ) values (v_job.id, v_job.attempts, 'lease_extended', p_worker_id, p_lease_token);

  return v_job.lease_expires_at;
end;
$$;

create or replace function public.complete_event_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_effect_reference_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.event_jobs%rowtype;
begin
  if p_effect_reference_hash is not null and p_effect_reference_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_EFFECT_REFERENCE_HASH';
  end if;

  update public.event_jobs job
  set state = 'succeeded',
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      effect_reference_hash = p_effect_reference_hash,
      succeeded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where job.id = p_job_id
    and job.state = 'leased'
    and job.lease_owner = p_worker_id
    and job.lease_token = p_lease_token
    and job.lease_expires_at > pg_catalog.now()
  returning * into v_job;

  if not found then
    raise exception using errcode = '55000', message = 'STALE_EVENT_JOB_LEASE';
  end if;

  insert into public.event_job_attempts (
    job_id, attempt_number, transition, worker_id, lease_token, effect_reference_hash
  ) values (
    v_job.id, v_job.attempts, 'succeeded', p_worker_id, p_lease_token, p_effect_reference_hash
  );
  return true;
end;
$$;

create or replace function public.fail_event_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_error_category text,
  p_error_code text,
  p_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.event_jobs%rowtype;
  v_state text;
  v_delay_seconds integer;
begin
  if p_error_category not in (
      'authentication', 'configuration', 'invalid_recipient', 'invalid_template',
      'rate_limited', 'provider_unavailable', 'timeout', 'rejected',
      'malformed_payload', 'unsupported_version', 'lease_expired', 'unknown'
    )
    or p_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$'
    or pg_catalog.char_length(p_error_code) > 64
  then
    raise exception using errcode = '22023', message = 'INVALID_SAFE_EVENT_ERROR';
  end if;

  select * into v_job
  from public.event_jobs job
  where job.id = p_job_id
    and job.state = 'leased'
    and job.lease_owner = p_worker_id
    and job.lease_token = p_lease_token
    and job.lease_expires_at > pg_catalog.now()
  for update;

  if not found then
    raise exception using errcode = '55000', message = 'STALE_EVENT_JOB_LEASE';
  end if;

  v_state := case
    when p_retryable and v_job.attempts < v_job.max_attempts then 'retryable'
    else 'dead'
  end;
  v_delay_seconds := least(3600, (120 * pg_catalog.power(2, v_job.attempts - 1))::integer);
  v_delay_seconds := greatest(
    1,
    least(
      3600,
      pg_catalog.round(
        v_delay_seconds * (
          1 + (((pg_catalog.abs(pg_catalog.hashtextextended(v_job.id::text || ':' || v_job.attempts::text, 0)) % 4001) - 2000)::numeric / 10000)
        )
      )::integer
    )
  );

  update public.event_jobs job
  set state = v_state,
      available_at = case
        when v_state = 'retryable'
          then pg_catalog.now() + pg_catalog.make_interval(secs => v_delay_seconds)
        else job.available_at
      end,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      last_error_category = p_error_category,
      last_error_code = p_error_code,
      dead_at = case when v_state = 'dead' then pg_catalog.now() else null end,
      updated_at = pg_catalog.now()
  where job.id = v_job.id;

  insert into public.event_job_attempts (
    job_id, attempt_number, transition, worker_id, lease_token, error_category, error_code
  ) values (
    v_job.id, v_job.attempts, v_state, p_worker_id, p_lease_token,
    p_error_category, p_error_code
  );
  return v_state;
end;
$$;

create or replace function public.cancel_event_job(
  p_job_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.event_jobs%rowtype;
begin
  if p_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$' then
    raise exception using errcode = '22023', message = 'INVALID_CANCELLATION_CODE';
  end if;

  update public.event_jobs job
  set state = 'cancelled',
      cancelled_at = pg_catalog.now(),
      last_error_category = 'rejected',
      last_error_code = p_error_code,
      updated_at = pg_catalog.now()
  where job.id = p_job_id
    and job.state in ('pending', 'retryable', 'replayed')
  returning * into v_job;

  if not found then return false; end if;
  insert into public.event_job_attempts (
    job_id, attempt_number, transition, error_category, error_code
  ) values (v_job.id, v_job.attempts, 'cancelled', 'rejected', p_error_code);
  return true;
end;
$$;

create or replace function public.request_event_job_replay(
  p_source_job_id uuid,
  p_operation_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_source_job public.event_jobs%rowtype;
  v_request_id uuid := gen_random_uuid();
  v_replay_job_id uuid := gen_random_uuid();
  v_existing_job_id uuid;
  v_replay_root_id uuid;
begin
  if v_actor_id is null
    or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
    or not exists (
      select 1
      from public.profiles profile
      where profile.id = v_actor_id
        and profile.role in ('admin', 'super_admin')
        and profile.status = 'active'
        and profile.tenant_id is null
    )
  then
    raise exception using errcode = '42501', message = 'EVENT_REPLAY_NOT_AUTHORIZED';
  end if;

  if p_operation_id is null
    or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 8 and 240
    or p_reason ~* '(authorization|bearer|cookie|password|secret|token|signature|https?://|@|\+?[0-9][0-9 -]{7,})'
  then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_REPLAY_REQUEST';
  end if;

  select request.replay_job_id into v_existing_job_id
  from public.event_replay_requests request
  where request.requested_by = v_actor_id
    and request.operation_id = p_operation_id;
  if found then return v_existing_job_id; end if;

  select * into v_source_job
  from public.event_jobs source_job
  where source_job.id = p_source_job_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'EVENT_JOB_NOT_FOUND';
  end if;
  if v_source_job.state not in ('succeeded', 'dead', 'cancelled') then
    raise exception using errcode = '55000', message = 'EVENT_JOB_NOT_REPLAYABLE';
  end if;

  v_replay_root_id := coalesce(v_source_job.replay_of_job_id, v_source_job.id);
  insert into public.event_replay_requests (
    id, source_job_id, replay_job_id, requested_by, operation_id, reason
  ) values (
    v_request_id, v_source_job.id, v_replay_job_id, v_actor_id, p_operation_id,
    pg_catalog.btrim(p_reason)
  );

  begin
    insert into public.event_jobs (
      id, event_id, consumer_name, state, max_attempts, replay_of_job_id, replay_request_id
    ) values (
      v_replay_job_id, v_source_job.event_id, v_source_job.consumer_name, 'replayed',
      v_source_job.max_attempts, v_replay_root_id, v_request_id
    );
  exception when unique_violation then
    raise exception using errcode = '55000', message = 'EVENT_REPLAY_ALREADY_ACTIVE';
  end;

  return v_replay_job_id;
end;
$$;

create or replace function public.record_event_worker_heartbeat(
  p_worker_id uuid,
  p_worker_name text,
  p_consumer_name text,
  p_scheduler_owner text,
  p_release_version text,
  p_started_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_worker_heartbeats (
    worker_id, worker_name, consumer_name, scheduler_owner,
    release_version, started_at, heartbeat_at
  ) values (
    p_worker_id, p_worker_name, p_consumer_name, p_scheduler_owner,
    p_release_version, p_started_at, pg_catalog.now()
  )
  on conflict (worker_id) do update
  set worker_name = excluded.worker_name,
      consumer_name = excluded.consumer_name,
      scheduler_owner = excluded.scheduler_owner,
      release_version = excluded.release_version,
      started_at = excluded.started_at,
      heartbeat_at = pg_catalog.now(),
      updated_at = pg_catalog.now();
  return true;
end;
$$;

create or replace function public.reserve_inbound_webhook(
  p_provider text,
  p_destination_key_hash text,
  p_provider_event_id_hash text,
  p_payload_hash text,
  p_occurred_at timestamptz,
  p_signature_verified boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_destination_id uuid;
  v_receipt_id uuid;
begin
  if p_signature_verified is not true
    or p_destination_key_hash !~ '^[a-f0-9]{64}$'
    or p_provider_event_id_hash !~ '^[a-f0-9]{64}$'
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_occurred_at < pg_catalog.now() - interval '5 minutes'
    or p_occurred_at > pg_catalog.now() + interval '5 minutes'
  then
    return null;
  end if;

  select destination.id into v_destination_id
  from public.inbound_destinations destination
  where destination.provider = p_provider
    and destination.destination_key_hash = p_destination_key_hash
    and destination.enabled;
  if not found then return null; end if;

  insert into public.inbound_webhook_receipts (
    provider, destination_id, provider_event_id_hash, payload_hash, occurred_at
  ) values (
    p_provider, v_destination_id, p_provider_event_id_hash, p_payload_hash, p_occurred_at
  )
  on conflict (provider, destination_id, provider_event_id_hash) do nothing
  returning id into v_receipt_id;
  return v_receipt_id;
end;
$$;

create or replace function public.read_event_queue_health(
  p_consumer_name text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'pending_count', count(*) filter (where job.state in ('pending', 'retryable', 'replayed')),
    'leased_count', count(*) filter (where job.state = 'leased'),
    'dead_count', count(*) filter (where job.state = 'dead'),
    'oldest_due_seconds', coalesce(
      extract(epoch from (
        pg_catalog.now() - (
          min(job.available_at) filter (
            where job.state in ('pending', 'retryable', 'replayed')
              and job.available_at <= pg_catalog.now()
          )
        )
      )),
      0
    ),
    'expired_lease_count', count(*) filter (
      where job.state = 'leased' and job.lease_expires_at <= pg_catalog.now()
    ),
    'stale_worker_count', (
      select count(*)
      from public.event_worker_heartbeats heartbeat
      where (p_consumer_name is null or heartbeat.consumer_name = p_consumer_name)
        and heartbeat.heartbeat_at < pg_catalog.now() - interval '5 minutes'
    ),
    'generated_at', pg_catalog.now()
  )
  from public.event_jobs job
  where p_consumer_name is null or job.consumer_name = p_consumer_name;
$$;

revoke all on table public.event_consumer_registrations from anon, authenticated, service_role;
revoke all on table public.domain_events from anon, authenticated, service_role;
revoke all on table public.event_jobs from anon, authenticated, service_role;
revoke all on table public.event_job_attempts from anon, authenticated, service_role;
revoke all on table public.event_replay_requests from anon, authenticated, service_role;
revoke all on table public.inbound_destinations from anon, authenticated, service_role;
revoke all on table public.inbound_webhook_receipts from anon, authenticated, service_role;
revoke all on table public.event_worker_heartbeats from anon, authenticated, service_role;
revoke all on sequence public.event_job_attempts_id_seq from anon, authenticated, service_role;

revoke all on function public.reject_event_history_mutation() from public, anon, authenticated;
revoke all on function public.event_payload_is_safe(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.publish_domain_event(uuid, text, smallint, timestamptz, uuid, uuid, uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.claim_event_jobs(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.extend_event_job_lease(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_event_job(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_event_job(uuid, uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.cancel_event_job(uuid, text) from public, anon, authenticated;
revoke all on function public.request_event_job_replay(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_event_worker_heartbeat(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_inbound_webhook(text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.read_event_queue_health(text) from public, anon, authenticated;

grant execute on function public.publish_domain_event(uuid, text, smallint, timestamptz, uuid, uuid, uuid, uuid, uuid, text, jsonb, text) to service_role;
grant execute on function public.claim_event_jobs(uuid, text, integer, integer) to service_role;
grant execute on function public.extend_event_job_lease(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.complete_event_job(uuid, uuid, uuid, text) to service_role;
grant execute on function public.fail_event_job(uuid, uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.cancel_event_job(uuid, text) to service_role;
grant execute on function public.request_event_job_replay(uuid, uuid, text) to authenticated;
grant execute on function public.record_event_worker_heartbeat(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.reserve_inbound_webhook(text, text, text, text, timestamptz, boolean) to service_role;
grant execute on function public.read_event_queue_health(text) to service_role;

commit;
