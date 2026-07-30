-- Step 11a: async CSV import jobs for clients and employees.

create type public.bulk_import_kind as enum ('clients','employees');
create type public.bulk_import_status as enum (
  'uploaded','validating','validated','importing','completed','failed','cancelled'
);

create table if not exists public.bulk_import_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  kind public.bulk_import_kind not null,
  parent_client_id uuid references public.clients(id) on delete cascade,
  storage_path text not null,
  status public.bulk_import_status not null default 'uploaded',
  total_rows int,
  processed_rows int default 0,
  error_rows int default 0,
  errors jsonb default '[]'::jsonb,
  dedupe_key text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bulk_import_jobs_parent_client_required
    check ((kind = 'employees' and parent_client_id is not null) or (kind = 'clients'))
);

create index if not exists bulk_import_jobs_tenant_status
  on public.bulk_import_jobs (tenant_id, status, created_at desc);
create index if not exists bulk_import_jobs_parent_client_idx
  on public.bulk_import_jobs (parent_client_id);

alter table public.bulk_import_jobs enable row level security;

drop policy if exists bulk_import_jobs_admin_read on public.bulk_import_jobs;
create policy bulk_import_jobs_admin_read on public.bulk_import_jobs for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin','admin'));

drop policy if exists bulk_import_jobs_tenant_read on public.bulk_import_jobs;
create policy bulk_import_jobs_tenant_read on public.bulk_import_jobs for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'pro'
  );

drop policy if exists bulk_import_jobs_tenant_create on public.bulk_import_jobs;
create policy bulk_import_jobs_tenant_create on public.bulk_import_jobs for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

drop policy if exists bulk_import_jobs_tenant_update on public.bulk_import_jobs;
create policy bulk_import_jobs_tenant_update on public.bulk_import_jobs for update
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

drop trigger if exists bulk_import_jobs_set_updated_at on public.bulk_import_jobs;
create trigger bulk_import_jobs_set_updated_at before update on public.bulk_import_jobs
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
  values ('tenant-imports', 'tenant-imports', false)
  on conflict (id) do nothing;

drop policy if exists tenant_imports_admin_read on storage.objects;
create policy tenant_imports_admin_read on storage.objects for select
  using (
    bucket_id = 'tenant-imports'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin','admin')
  );

drop policy if exists tenant_imports_tenant_read on storage.objects;
create policy tenant_imports_tenant_read on storage.objects for select
  using (
    bucket_id = 'tenant-imports'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

drop policy if exists tenant_imports_tenant_write on storage.objects;
create policy tenant_imports_tenant_write on storage.objects for insert
  with check (
    bucket_id = 'tenant-imports'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

alter table public.tenant_audit_log
  drop constraint if exists tenant_audit_log_action_check;

alter table public.tenant_audit_log
  add constraint tenant_audit_log_action_check
  check (action in (
    'created',
    'approved',
    'rejected',
    'suspended',
    'reactivated',
    'updated',
    'completed',
    'cancelled',
    'unlocked',
    'session_revoked',
    'invoice_created',
    'invoice_voided',
    'invoice_marked_paid',
    'payment_initiated',
    'payment_succeeded',
    'payment_failed',
    'refund_issued',
    'infected_blocked',
    'reconciled',
    'comms_skipped_opted_out',
    'lead_created',
    'lead_assigned',
    'lead_stage_changed',
    'lead_note_added',
    'erasure_requested',
    'erasure_verified',
    'erasure_approved',
    'erasure_rejected',
    'erasure_completed',
    'bulk_imported'
  ));
