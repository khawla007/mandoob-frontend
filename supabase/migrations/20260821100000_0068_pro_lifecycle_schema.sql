-- Normalize PRO credentials and commercial terms without fabricating legacy approval.
begin;

create extension if not exists btree_gist with schema extensions;

create type public.pro_credential_type as enum ('pro_license');
create type public.pro_credential_state as enum (
  'draft',
  'submitted',
  'under_review',
  'verified',
  'rejected',
  'expired',
  'revoked'
);
create type public.pro_credential_event as enum (
  'submitted',
  'review_started',
  'verified',
  'rejected',
  'expired',
  'revoked',
  'superseded'
);
create type public.pro_term_kind as enum ('pricing', 'compensation');
create type public.pro_term_model as enum ('per_registration', 'retainer');
create type public.pro_term_interval as enum ('monthly', 'annual');
create type public.pro_term_status as enum ('draft', 'active', 'ended');
create type public.pro_term_event as enum ('created', 'activated', 'ended');
create type public.pro_lifecycle_operation_kind as enum ('credential', 'commercial_term');

create table public.pro_credentials (
  id uuid primary key default gen_random_uuid(),
  pro_profile_id uuid not null references public.pro_profiles(profile_id) on delete cascade,
  credential_type public.pro_credential_type not null default 'pro_license',
  identifier_ciphertext text,
  identifier_hash text,
  identifier_last4 text,
  issuing_authority text,
  issue_date date,
  expiry_date date,
  state public.pro_credential_state not null default 'draft',
  version bigint not null default 0,
  legacy_unmasked boolean not null default false,
  supersedes_credential_id uuid references public.pro_credentials(id) on delete restrict,
  submitted_at timestamptz,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_credentials_profile_identity unique (pro_profile_id, id),
  constraint pro_credentials_version_nonnegative check (version >= 0),
  constraint pro_credentials_identifier_shape check (
    (
      not legacy_unmasked
      and identifier_ciphertext is null
      and identifier_hash is null
      and identifier_last4 is null
    )
    or (
      legacy_unmasked
      and identifier_ciphertext is not null
      and identifier_hash is null
      and identifier_last4 is null
    )
    or (
      not legacy_unmasked
      and pg_catalog.length(identifier_ciphertext) > 0
      and identifier_hash ~ '^[0-9a-f]{64}$'
      and identifier_last4 ~ '^[A-Z0-9]{4}$'
    )
  ),
  constraint pro_credentials_authority_shape check (
    issuing_authority is null
    or pg_catalog.char_length(pg_catalog.btrim(issuing_authority)) between 2 and 160
  ),
  constraint pro_credentials_date_pair check (
    (issue_date is null and expiry_date is null)
    or (issue_date is not null and expiry_date is not null and issue_date <= expiry_date)
  ),
  constraint pro_credentials_legacy_shape check (
    not legacy_unmasked
    or (
      state = 'draft'
      and identifier_ciphertext is not null
      and identifier_hash is null
      and identifier_last4 is null
      and issuing_authority is null
      and issue_date is null
      and expiry_date is null
      and submitted_at is null
    )
  ),
  constraint pro_credentials_submitted_shape check (
    (state = 'draft' and submitted_at is null)
    or (state <> 'draft' and submitted_at is not null)
  ),
  constraint pro_credentials_not_self_superseding check (supersedes_credential_id is distinct from id)
);

create unique index pro_credentials_identifier_hash_uniq
  on public.pro_credentials(credential_type, identifier_hash)
  where identifier_hash is not null;
create unique index pro_credentials_one_nonterminal
  on public.pro_credentials(pro_profile_id, credential_type)
  where state in ('draft', 'submitted', 'under_review');
create unique index pro_credentials_one_verified
  on public.pro_credentials(pro_profile_id, credential_type)
  where state = 'verified';
create index pro_credentials_registry_state_expiry_idx
  on public.pro_credentials(state, expiry_date, pro_profile_id, id);
create index pro_credentials_profile_history_idx
  on public.pro_credentials(pro_profile_id, created_at desc, id desc);

create table public.pro_credential_evidence (
  id uuid primary key default gen_random_uuid(),
  pro_profile_id uuid not null,
  credential_id uuid not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  original_name_safe text not null,
  scan_provider text not null,
  scan_completed_at timestamptz not null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_credential_evidence_credential_fk
    foreign key (pro_profile_id, credential_id)
    references public.pro_credentials(pro_profile_id, id)
    on delete cascade,
  constraint pro_credential_evidence_mime check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint pro_credential_evidence_size check (
    size_bytes between 1 and 10485760
  ),
  constraint pro_credential_evidence_sha256 check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint pro_credential_evidence_name check (
    pg_catalog.char_length(pg_catalog.btrim(original_name_safe)) between 1 and 255
    and original_name_safe !~ '[/\\]'
    and original_name_safe !~ '[[:cntrl:]]'
  ),
  constraint pro_credential_evidence_provider check (
    pg_catalog.char_length(pg_catalog.btrim(scan_provider)) between 1 and 80
  ),
  constraint pro_credential_evidence_path check (
    storage_path = 'pro-credentials/' || pro_profile_id::text || '/' || credential_id::text || '/' || id::text
  )
);
create index pro_credential_evidence_credential_idx
  on public.pro_credential_evidence(pro_profile_id, credential_id, created_at, id);

create table public.pro_credential_decisions (
  id uuid primary key default gen_random_uuid(),
  pro_profile_id uuid not null,
  credential_id uuid not null,
  event public.pro_credential_event not null,
  from_state public.pro_credential_state not null,
  to_state public.pro_credential_state not null,
  reason_code text,
  reason text,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  credential_version bigint not null,
  created_at timestamptz not null default now(),
  constraint pro_credential_decisions_credential_fk
    foreign key (pro_profile_id, credential_id)
    references public.pro_credentials(pro_profile_id, id)
    on delete restrict,
  constraint pro_credential_decisions_version_positive check (credential_version > 0),
  constraint pro_credential_decisions_reason_code check (
    reason_code is null
    or (
      pg_catalog.char_length(reason_code) between 2 and 80
      and reason_code ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  constraint pro_credential_decisions_reason check (
    reason is null
    or pg_catalog.char_length(pg_catalog.btrim(reason)) between 3 and 500
  ),
  constraint pro_credential_decisions_rejection_reason check (
    (event not in ('rejected', 'revoked'))
    or (reason_code is not null and reason is not null)
  )
);
create index pro_credential_decisions_timeline_idx
  on public.pro_credential_decisions(pro_profile_id, created_at desc, id desc);

create table public.pro_commercial_terms (
  id uuid primary key default gen_random_uuid(),
  pro_profile_id uuid not null references public.pro_profiles(profile_id) on delete cascade,
  term_kind public.pro_term_kind not null,
  model public.pro_term_model not null,
  currency text not null default 'AED',
  amount_minor bigint not null,
  retainer_interval public.pro_term_interval,
  scope text not null default 'all_registrations',
  effective_from date not null,
  effective_to date,
  status public.pro_term_status not null default 'draft',
  version bigint not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_commercial_terms_profile_identity unique (pro_profile_id, id),
  constraint pro_commercial_terms_profile_kind_version unique (pro_profile_id, term_kind, version),
  constraint pro_commercial_terms_amount check (amount_minor > 0),
  constraint pro_commercial_terms_currency check (currency = 'AED'),
  constraint pro_commercial_terms_scope check (scope = 'all_registrations'),
  constraint pro_commercial_terms_interval check (
    (model = 'per_registration' and retainer_interval is null)
    or (model = 'retainer' and retainer_interval is not null)
  ),
  constraint pro_commercial_terms_dates check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint pro_commercial_terms_version_positive check (version > 0)
);
alter table public.pro_commercial_terms
  add constraint pro_commercial_terms_active_date_exclusion
  exclude using gist (
    pro_profile_id with =,
    term_kind with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  ) where (status = 'active');
create index pro_commercial_terms_history_idx
  on public.pro_commercial_terms(pro_profile_id, term_kind, effective_from desc, id desc);

create table public.pro_commercial_term_events (
  id uuid primary key default gen_random_uuid(),
  pro_profile_id uuid not null,
  commercial_term_id uuid not null,
  event public.pro_term_event not null,
  from_status public.pro_term_status,
  to_status public.pro_term_status not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  term_version bigint not null,
  created_at timestamptz not null default now(),
  constraint pro_commercial_term_events_term_fk
    foreign key (pro_profile_id, commercial_term_id)
    references public.pro_commercial_terms(pro_profile_id, id)
    on delete restrict,
  constraint pro_commercial_term_events_version_positive check (term_version > 0)
);
create index pro_commercial_term_events_timeline_idx
  on public.pro_commercial_term_events(pro_profile_id, created_at desc, id desc);

create table public.pro_assignment_term_links (
  assignment_id uuid primary key references public.pro_company_assignments(id) on delete restrict,
  pricing_term_id uuid not null references public.pro_commercial_terms(id) on delete restrict,
  compensation_term_id uuid not null references public.pro_commercial_terms(id) on delete restrict,
  linked_at timestamptz not null default now(),
  linked_by uuid not null references public.profiles(id) on delete restrict,
  constraint pro_assignment_term_links_distinct_terms check (
    pricing_term_id <> compensation_term_id
  )
);
create index pro_assignment_term_links_pricing_idx
  on public.pro_assignment_term_links(pricing_term_id);
create index pro_assignment_term_links_compensation_idx
  on public.pro_assignment_term_links(compensation_term_id);

create table public.pro_lifecycle_operation_receipts (
  entity_kind public.pro_lifecycle_operation_kind not null,
  entity_id uuid not null,
  operation_id uuid not null,
  payload_hash text not null,
  sanitized_result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (entity_id, operation_id),
  constraint pro_lifecycle_operation_payload_hash check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint pro_lifecycle_operation_result_object check (
    pg_catalog.jsonb_typeof(sanitized_result) = 'object'
  )
);
create index pro_lifecycle_operation_receipts_cleanup_idx
  on public.pro_lifecycle_operation_receipts(created_at, entity_id, operation_id);

create trigger pro_credentials_set_updated_at
  before update on public.pro_credentials
  for each row execute function public.set_updated_at();
create trigger pro_credential_evidence_set_updated_at
  before update on public.pro_credential_evidence
  for each row execute function public.set_updated_at();
create trigger pro_commercial_terms_set_updated_at
  before update on public.pro_commercial_terms
  for each row execute function public.set_updated_at();

insert into public.pro_credentials (
  pro_profile_id,
  credential_type,
  identifier_ciphertext,
  identifier_hash,
  identifier_last4,
  issuing_authority,
  issue_date,
  expiry_date,
  state,
  version,
  legacy_unmasked,
  created_by
)
select
  legacy.profile_id,
  'pro_license',
  legacy.license_no_encrypted,
  null,
  null,
  null,
  null,
  null,
  'draft',
  0,
  true,
  null
from public.pro_profiles legacy
where legacy.license_no_encrypted is not null;

do $$
declare
  v_legacy_source_count bigint;
  v_legacy_draft_count bigint;
begin
  select pg_catalog.count(*)
    into v_legacy_source_count
  from public.pro_profiles
  where license_no_encrypted is not null;

  select pg_catalog.count(*)
    into v_legacy_draft_count
  from public.pro_credentials
  where legacy_unmasked = true
    and state = 'draft'
    and identifier_hash is null
    and identifier_last4 is null
    and issuing_authority is null
    and issue_date is null
    and expiry_date is null;

  if v_legacy_source_count <> v_legacy_draft_count then
    raise exception using
      errcode = '23514',
      message = 'PRO_LEGACY_CREDENTIAL_BACKFILL_MISMATCH',
      detail = pg_catalog.format(
        'source_count=%s draft_count=%s',
        v_legacy_source_count,
        v_legacy_draft_count
      );
  end if;
end;
$$;

alter table public.pro_credentials enable row level security;
alter table public.pro_credential_evidence enable row level security;
alter table public.pro_credential_decisions enable row level security;
alter table public.pro_commercial_terms enable row level security;
alter table public.pro_commercial_term_events enable row level security;
alter table public.pro_assignment_term_links enable row level security;
alter table public.pro_lifecycle_operation_receipts enable row level security;

revoke all on table public.pro_credentials from public, anon, authenticated;
revoke all on table public.pro_credential_evidence from public, anon, authenticated;
revoke all on table public.pro_credential_decisions from public, anon, authenticated;
revoke all on table public.pro_commercial_terms from public, anon, authenticated;
revoke all on table public.pro_commercial_term_events from public, anon, authenticated;
revoke all on table public.pro_assignment_term_links from public, anon, authenticated;
revoke all on table public.pro_lifecycle_operation_receipts from public, anon, authenticated;

commit;
