-- 0040_employee_portal.sql
-- Step 28 - Employee self-service portal ownership links and preferences.

alter table public.renewals
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

alter table public.documents
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

alter table public.document_requests
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create table if not exists public.employee_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  renewal_reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_notification_preferences_employee_uniq unique (employee_id),
  constraint employee_notification_preferences_profile_uniq unique (profile_id)
);

alter table public.employee_notification_preferences enable row level security;

drop trigger if exists employee_notification_preferences_set_updated_at
  on public.employee_notification_preferences;
create trigger employee_notification_preferences_set_updated_at
  before update on public.employee_notification_preferences
  for each row execute function public.set_updated_at();

create index if not exists renewals_tenant_employee_due_idx
  on public.renewals (tenant_id, employee_id, due_date)
  where employee_id is not null;

create index if not exists documents_tenant_employee_type_idx
  on public.documents (tenant_id, employee_id, doc_type)
  where employee_id is not null;

create index if not exists document_requests_tenant_employee_type_idx
  on public.document_requests (tenant_id, employee_id, doc_type)
  where employee_id is not null;

create index if not exists employee_notification_preferences_tenant_employee_idx
  on public.employee_notification_preferences (tenant_id, employee_id);

-- Existing tenant-wide read policies are preserved for tenant operators and
-- customers, but employees get narrower self-service policies below.
drop policy if exists renewals_tenant_read on public.renewals;
create policy renewals_tenant_read on public.renewals for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'employee'
  );

drop policy if exists documents_tenant_read on public.documents;
create policy documents_tenant_read on public.documents for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'employee'
  );

drop policy if exists document_requests_tenant_read on public.document_requests;
create policy document_requests_tenant_read on public.document_requests for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'employee'
  );

drop policy if exists document_versions_tenant_read on public.document_versions;
create policy document_versions_tenant_read on public.document_versions for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'employee'
  );

drop policy if exists renewals_employee_self_read on public.renewals;
create policy renewals_employee_self_read on public.renewals for select
  using (
    exists (
      select 1
      from public.employees e
      where e.id = renewals.employee_id
        and e.tenant_id = renewals.tenant_id
        and e.profile_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists documents_employee_self_read on public.documents;
create policy documents_employee_self_read on public.documents for select
  using (
    exists (
      select 1
      from public.employees e
      where e.id = documents.employee_id
        and e.tenant_id = documents.tenant_id
        and e.profile_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists document_requests_employee_self_read on public.document_requests;
create policy document_requests_employee_self_read on public.document_requests for select
  using (
    exists (
      select 1
      from public.employees e
      where e.id = document_requests.employee_id
        and e.tenant_id = document_requests.tenant_id
        and e.profile_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists document_versions_employee_self_read on public.document_versions;
create policy document_versions_employee_self_read on public.document_versions for select
  using (
    exists (
      select 1
      from public.documents d
      join public.employees e on e.id = d.employee_id
      where d.id = document_versions.document_id
        and d.tenant_id = document_versions.tenant_id
        and e.tenant_id = document_versions.tenant_id
        and e.profile_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists employee_notification_preferences_self_read on public.employee_notification_preferences;
create policy employee_notification_preferences_self_read
  on public.employee_notification_preferences for select
  using (profile_id = auth.uid());

drop policy if exists employee_notification_preferences_self_update on public.employee_notification_preferences;
create policy employee_notification_preferences_self_update
  on public.employee_notification_preferences for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists employee_notification_preferences_self_insert on public.employee_notification_preferences;
create policy employee_notification_preferences_self_insert
  on public.employee_notification_preferences for insert
  with check (profile_id = auth.uid());

drop policy if exists employee_notification_preferences_tenant_operator_read
  on public.employee_notification_preferences;
create policy employee_notification_preferences_tenant_operator_read
  on public.employee_notification_preferences for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

drop policy if exists employee_notification_preferences_super_admin_read
  on public.employee_notification_preferences;
create policy employee_notification_preferences_super_admin_read
  on public.employee_notification_preferences for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
