-- 0019_documents_foundation.sql
-- Step 12 — Document Management foundation (PRD Module 12).
--
-- Adds:
--   * document_requests   — PRO asks the customer for a specific document
--   * documents           — head record per logical document (one per
--                           tenant + client + doc_type + request)
--   * document_versions   — append-only file history with review state
--   * tenant-documents    — private Supabase Storage bucket
--   * RLS                 — tenant-scoped read/write via JWT claims;
--                           service-role bypasses for system-driven writes
--
-- Source: docs/step-12-prompt.md, docs/step-12-documents-foundation-plan.md.

-- ============================================================
-- doc_type CHECK list — locked by the kickoff prompt §1
-- ============================================================
-- 'passport' | 'visa' | 'emirates_id' | 'trade_license' | 'ejari' |
-- 'moa' | 'shareholder_id' | 'other'

-- ============================================================
-- document_requests
-- ============================================================
create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  doc_type text not null check (doc_type in (
    'passport','visa','emirates_id','trade_license','ejari','moa','shareholder_id','other'
  )),
  label text not null,
  notes text,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','fulfilled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.document_requests enable row level security;

drop trigger if exists document_requests_set_updated_at on public.document_requests;
create trigger document_requests_set_updated_at before update on public.document_requests
  for each row execute function public.set_updated_at();

create index if not exists document_requests_tenant_client_idx
  on public.document_requests (tenant_id, client_id);
create index if not exists document_requests_tenant_pending_idx
  on public.document_requests (tenant_id, created_at desc)
  where status = 'pending';

-- ============================================================
-- documents — head record. current_version_id FK added after
--             document_versions exists (cyclic FK pair).
-- ============================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  request_id uuid references public.document_requests(id) on delete set null,
  doc_type text not null check (doc_type in (
    'passport','visa','emirates_id','trade_license','ejari','moa','shareholder_id','other'
  )),
  label text,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.documents enable row level security;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

create index if not exists documents_tenant_client_idx
  on public.documents (tenant_id, client_id);
create index if not exists documents_request_idx
  on public.documents (request_id) where request_id is not null;

-- ============================================================
-- document_versions — append-only file history.
-- ============================================================
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  tenant_id uuid not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.document_versions enable row level security;

create index if not exists document_versions_document_created_idx
  on public.document_versions (document_id, created_at desc);
create index if not exists document_versions_tenant_idx
  on public.document_versions (tenant_id);

-- Close the cyclic FK on documents.current_version_id now that
-- document_versions exists. Deferrable so a single transaction can
-- INSERT documents → INSERT document_versions → UPDATE documents.
alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id)
  references public.document_versions(id)
  on delete set null
  deferrable initially deferred;

-- ============================================================
-- RLS — document_requests
-- ============================================================
drop policy if exists document_requests_super_admin_read on public.document_requests;
create policy document_requests_super_admin_read on public.document_requests for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop policy if exists document_requests_tenant_read on public.document_requests;
create policy document_requests_tenant_read on public.document_requests for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid);

drop policy if exists document_requests_pro_write on public.document_requests;
create policy document_requests_pro_write on public.document_requests for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

-- ============================================================
-- RLS — documents
-- ============================================================
drop policy if exists documents_super_admin_read on public.documents;
create policy documents_super_admin_read on public.documents for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop policy if exists documents_tenant_read on public.documents;
create policy documents_tenant_read on public.documents for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid);

drop policy if exists documents_tenant_write on public.documents;
create policy documents_tenant_write on public.documents for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin','customer')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin','customer')
  );

-- ============================================================
-- RLS — document_versions
-- ============================================================
drop policy if exists document_versions_super_admin_read on public.document_versions;
create policy document_versions_super_admin_read on public.document_versions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop policy if exists document_versions_tenant_read on public.document_versions;
create policy document_versions_tenant_read on public.document_versions for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid);

drop policy if exists document_versions_tenant_insert on public.document_versions;
create policy document_versions_tenant_insert on public.document_versions for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin','customer')
  );

drop policy if exists document_versions_pro_review on public.document_versions;
create policy document_versions_pro_review on public.document_versions for update
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

-- ============================================================
-- Storage bucket — tenant-documents (private)
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('tenant-documents', 'tenant-documents', false)
  on conflict (id) do nothing;

-- Storage object policies. Path layout:
--   <tenant_id>/<client_id>/<doc_type>/<filename>
-- The first path segment is the tenant_id. The role gate matches the
-- table-level write policy: pro/admin/customer for own tenant; super_admin
-- bypasses via service-role.
drop policy if exists tenant_documents_super_admin_read on storage.objects;
create policy tenant_documents_super_admin_read on storage.objects for select
  using (
    bucket_id = 'tenant-documents'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  );

drop policy if exists tenant_documents_tenant_read on storage.objects;
create policy tenant_documents_tenant_read on storage.objects for select
  using (
    bucket_id = 'tenant-documents'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

drop policy if exists tenant_documents_tenant_write on storage.objects;
create policy tenant_documents_tenant_write on storage.objects for insert
  with check (
    bucket_id = 'tenant-documents'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin','customer')
  );
