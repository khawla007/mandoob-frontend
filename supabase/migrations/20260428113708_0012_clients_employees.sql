-- Clients (customer companies) + employees.
-- Source: PRD §20.1 lines 780–795, §8.2 line 326–328, §3 line 128–131.

create type public.client_status as enum (
  'onboarding','active','renewal_due','renewal_overdue','suspended','churned'
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_name text not null,
  trade_license_no text,
  license_expiry date,
  jurisdiction text,
  status public.client_status not null default 'onboarding',
  shareholders jsonb not null default '[]'::jsonb,
  registered_activities jsonb not null default '[]'::jsonb,
  office_address jsonb,
  bank_details jsonb,
  assigned_pro_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clients enable row level security;

drop policy if exists clients_tenant_rw on public.clients;
create policy clients_tenant_rw on public.clients for all
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid)
  with check (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid);

drop policy if exists clients_super_admin_read on public.clients;
create policy clients_super_admin_read on public.clients for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

create index if not exists clients_tenant_id_idx on public.clients (tenant_id);
create index if not exists clients_assigned_pro_idx on public.clients (assigned_pro_profile_id);

-- ============================================================
-- employees
-- ============================================================
create type public.employee_status as enum ('active','inactive','terminated');

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text,
  phone text,
  nationality text,
  passport_no_encrypted text,
  visa_no_encrypted text,
  visa_expiry date,
  emirates_id_encrypted text,
  eid_expiry date,
  status public.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.employees enable row level security;

drop policy if exists employees_tenant_read on public.employees;
create policy employees_tenant_read on public.employees for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid);

drop policy if exists employees_self_read on public.employees;
create policy employees_self_read on public.employees for select
  using (profile_id = auth.uid());

drop policy if exists employees_tenant_write on public.employees;
create policy employees_tenant_write on public.employees for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin','super_admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
  );

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

create index if not exists employees_tenant_id_idx on public.employees (tenant_id);
create index if not exists employees_client_id_idx on public.employees (client_id);
create index if not exists employees_profile_id_idx on public.employees (profile_id);
