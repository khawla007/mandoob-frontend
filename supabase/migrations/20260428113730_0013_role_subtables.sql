-- Role-specific sub-tables for `pro` and `customer` plus admin lifecycle audit.
-- Source: PRD §10.2 (PRO mgmt), §7.2 (customer questionnaire),
-- user spec — super_admin manages admin lifecycle.

-- ============================================================
-- pro_profiles (1:1 with profiles where role='pro')
-- ============================================================
create table if not exists public.pro_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  license_no_encrypted text,
  designation text,
  department text,
  credentials_verified boolean not null default false,
  verified_at timestamptz,
  verified_by_profile_id uuid references public.profiles(id) on delete set null,
  service_areas jsonb not null default '[]'::jsonb,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pro_profiles enable row level security;

drop policy if exists pro_profiles_self_read on public.pro_profiles;
create policy pro_profiles_self_read on public.pro_profiles for select
  using (profile_id = auth.uid());

drop policy if exists pro_profiles_tenant_read on public.pro_profiles;
create policy pro_profiles_tenant_read on public.pro_profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = pro_profiles.profile_id
        and p.tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    )
  );

drop policy if exists pro_profiles_self_update on public.pro_profiles;
create policy pro_profiles_self_update on public.pro_profiles for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists pro_profiles_super_admin_all on public.pro_profiles;
create policy pro_profiles_super_admin_all on public.pro_profiles for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop trigger if exists pro_profiles_set_updated_at on public.pro_profiles;
create trigger pro_profiles_set_updated_at before update on public.pro_profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- customer_profiles (1:1 with profiles where role='customer')
-- ============================================================
create table if not exists public.customer_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  nationality text,
  passport_no_encrypted text,
  linked_client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_profiles enable row level security;

drop policy if exists customer_profiles_self_rw on public.customer_profiles;
create policy customer_profiles_self_rw on public.customer_profiles for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists customer_profiles_tenant_pro_read on public.customer_profiles;
create policy customer_profiles_tenant_pro_read on public.customer_profiles for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = customer_profiles.linked_client_id
        and c.tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    )
  );

drop trigger if exists customer_profiles_set_updated_at on public.customer_profiles;
create trigger customer_profiles_set_updated_at before update on public.customer_profiles
  for each row execute function public.set_updated_at();

create index if not exists customer_profiles_linked_client_idx on public.customer_profiles (linked_client_id);

-- ============================================================
-- admin_audit_actions (super_admin lifecycle on admin profiles)
-- ============================================================
create type public.admin_audit_action as enum (
  'create_admin','remove_admin','suspend_admin','restore_admin'
);

create table if not exists public.admin_audit_actions (
  id bigserial primary key,
  actor_id uuid not null references auth.users(id),
  action public.admin_audit_action not null,
  target_profile_id uuid not null references public.profiles(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_actions enable row level security;
revoke update, delete on public.admin_audit_actions from public, authenticated, anon;

drop policy if exists admin_audit_actions_super_admin_read on public.admin_audit_actions;
create policy admin_audit_actions_super_admin_read on public.admin_audit_actions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
