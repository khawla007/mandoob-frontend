create extension if not exists citext;
create extension if not exists pgcrypto;

-- tenants
create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null,
  status text not null default 'active' check (status in ('active','suspended','pending')),
  plan text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tenants enable row level security;
create policy tenants_read_member on tenants for select
  using (id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));
-- writes: service role only.

-- profiles (1:1 auth.users)
create type app_role as enum ('super_admin','pro','customer','employee');
create type profile_status as enum ('active','invited','disabled');
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete restrict,
  role app_role not null,
  status profile_status not null default 'invited',
  full_name text,
  phone text,
  mfa_enrolled_at timestamptz,
  last_login_at timestamptz,
  consent_accepted_at timestamptz,
  policy_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_tenant_required check (role = 'super_admin' or tenant_id is not null)
);
alter table profiles enable row level security;
create policy profiles_read_self on profiles for select using (id = auth.uid());
create policy profiles_read_tenant on profiles for select
  using (tenant_id is not null
         and tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

create index profiles_tenant_idx on profiles (tenant_id);

-- password history
create table user_password_history (
  user_id uuid references auth.users(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, created_at)
);
alter table user_password_history enable row level security;
-- service-role only; no policies.

-- mfa recovery codes
create table user_mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table user_mfa_recovery_codes enable row level security;

-- failed attempts (dual-key account + /24 netblock)
create table auth_failed_attempts (
  key text primary key,
  count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table auth_failed_attempts enable row level security;

-- auth_events (append-only)
create type auth_event_kind as enum (
  'login_success','login_failure','logout',
  'password_reset_requested','password_reset_completed',
  'mfa_enrolled','mfa_challenge_success','mfa_challenge_failure','mfa_reset',
  'invite_created','invite_accepted','session_revoked',
  'impersonation_started','impersonation_ended'
);
create table auth_events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  tenant_id uuid,
  kind auth_event_kind not null,
  ip inet,
  user_agent text,
  details jsonb not null default '{}'::jsonb
);
alter table auth_events enable row level security;
revoke update, delete on auth_events from public, authenticated, anon;
create policy auth_events_read_self on auth_events for select
  using (actor_user_id = auth.uid());

create index auth_events_actor_idx on auth_events (actor_user_id, occurred_at desc);
create index auth_events_tenant_idx on auth_events (tenant_id, occurred_at desc);

-- invites
create table invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  email citext not null,
  role app_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table invites enable row level security;
create policy invites_rw_tenant on invites for all
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

-- updated_at triggers
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger tenants_set_updated_at before update on tenants
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on profiles
  for each row execute function public.set_updated_at();
