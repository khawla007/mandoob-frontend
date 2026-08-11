create table if not exists public.service_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  service_type text not null check (char_length(trim(service_type)) between 2 and 80),
  status text not null default 'draft' check (status in (
    'draft','documents_pending','ready_to_submit','submitted',
    'authority_review','approved','completed','cancelled'
  )),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  sla_due_at timestamptz,
  blocked_reason text check (blocked_reason is null or char_length(trim(blocked_reason)) between 2 and 500),
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create index if not exists service_cases_tenant_status_idx
  on public.service_cases(tenant_id, status, created_at desc);
create index if not exists service_cases_tenant_sla_idx
  on public.service_cases(tenant_id, sla_due_at)
  where status not in ('completed','cancelled');
create index if not exists service_cases_assignee_idx
  on public.service_cases(tenant_id, assigned_to, status);

drop trigger if exists service_cases_set_updated_at on public.service_cases;
create trigger service_cases_set_updated_at before update on public.service_cases
  for each row execute function public.set_updated_at();

alter table public.service_cases enable row level security;

drop policy if exists service_cases_super_admin_read on public.service_cases;
create policy service_cases_super_admin_read on public.service_cases for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop policy if exists service_cases_tenant_read on public.service_cases;
create policy service_cases_tenant_read on public.service_cases for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid);

drop policy if exists service_cases_pro_write on public.service_cases;
create policy service_cases_pro_write on public.service_cases for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );
