-- 0025_role_semantic_rebase.sql
-- Role semantics rebase: `admin` becomes Platform Admin (sub-employee of
-- super_admin, NULL tenant_id, cross-tenant read). `pro` becomes the sole
-- PRO firm owner role (one per tenant, NOT NULL tenant_id).
--
-- Plan: ../../docs/step-N-role-semantic-rebase-plan.md (working title
-- "there-is-a-big-virtual-church"). See also the Phase 1 spec: the original
-- shape treated `admin` as the tenant-scoped PRO firm owner gated by
-- `LAST_ADMIN_GUARD`. After this migration, the spec is inverted:
--
--   role         | tenant_id | cardinality          | scope
--   ------------ | --------- | -------------------- | ------------------
--   super_admin  | NULL      | >= 1 (singleton idx) | platform
--   admin        | NULL      | 0..N                 | platform (read-all)
--   pro          | NOT NULL  | exactly 1 / tenant   | tenant owner
--   customer     | NOT NULL  | 0..N / tenant        | tenant
--   employee     | NOT NULL  | 0..N / customer      | tenant
--
-- Partially supersedes:
--   * 0009_add_admin_role.sql            — admin role added (kept)
--   * 0010_profiles_extend_and_role_rls.sql — CHECK + admin RLS rewritten here
--   * 0012_clients_employees.sql         — employees write policy retag
--   * 0018_promote_existing_pro_admins.sql — its retag direction is reversed
--   * 0019_documents_foundation.sql      — documents/requests/versions RLS retag
--   * 0020_renewals_foundation.sql       — renewals RLS retag
--
-- Pre-production: no live customers. Breaking schema change is acceptable.

-- ============================================================
-- 1. Retag existing data BEFORE tightening the CHECK constraint.
--    Any `admin` row with a non-NULL tenant_id is, under the new
--    semantics, a `pro` (PRO firm owner). Demote it.
-- ============================================================

-- Drop the old CHECK first so retags do not collide with mid-flight rows.
alter table public.profiles drop constraint if exists profiles_tenant_required;

update public.profiles
   set role = 'pro',
       updated_at = now()
 where role = 'admin'
   and tenant_id is not null;

-- Mirror to auth.users.raw_app_meta_data so the next JWT carries the
-- corrected claim. Same DO $$ pattern as 0018.
do $$
declare
  rec record;
begin
  for rec in
    select id from public.profiles where role = 'pro' and tenant_id is not null
  loop
    update auth.users
       set raw_app_meta_data =
         coalesce(raw_app_meta_data, '{}'::jsonb)
         || jsonb_build_object('mandoob_role', 'pro')
     where id = rec.id
       and coalesce(raw_app_meta_data ->> 'mandoob_role', '') <> 'pro';
  end loop;
end $$;

-- ============================================================
-- 2. New CHECK constraint: platform roles must be tenantless,
--    tenant roles must have a tenant_id.
-- ============================================================
alter table public.profiles
  add constraint profiles_tenant_required
  check (
    (role in ('super_admin','admin') and tenant_id is null)
    or
    (role in ('pro','customer','employee') and tenant_id is not null)
  );

-- ============================================================
-- 3. ONE_PRO_PER_TENANT — replaces the deleted LAST_ADMIN_GUARD.
--    Active-only so soft-deleted/suspended pros do not block
--    re-provisioning.
-- ============================================================
create unique index if not exists profiles_one_pro_per_tenant
  on public.profiles (tenant_id)
  where role = 'pro' and status = 'active';

-- ============================================================
-- 4. Profiles RLS rewrite.
--    Before: profiles_admin_read + profiles_admin_write_non_super
--      treated admin as a tenant manager that could mutate tenant
--      profiles. Under the new model, platform admin is read-only at
--      the profile layer (mutations route through super_admin endpoints).
-- ============================================================
drop policy if exists profiles_admin_read on public.profiles;
drop policy if exists profiles_admin_write_non_super on public.profiles;

drop policy if exists profiles_admin_read_all on public.profiles;
create policy profiles_admin_read_all on public.profiles for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- 5. Clients — drop 'admin' from tenant write policy. Add platform
--    admin SELECT to mirror super_admin's cross-tenant read.
-- ============================================================
-- (clients already has clients_super_admin_read; add admin-read sibling.)
drop policy if exists clients_admin_read on public.clients;
create policy clients_admin_read on public.clients for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- clients_tenant_rw at 0012 line 27 uses `for all` with no role gate;
-- it stays as-is (tenant_id match alone is the gate). Nothing to retag.

-- ============================================================
-- 6. Employees — retag write policy to drop 'admin'; add admin read.
-- ============================================================
drop policy if exists employees_tenant_write on public.employees;
create policy employees_tenant_write on public.employees for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','super_admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
  );

drop policy if exists employees_admin_read on public.employees;
create policy employees_admin_read on public.employees for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- 7. Documents foundation (0019) — retag the four affected policies
--    to remove 'admin'; add platform-admin SELECT siblings.
-- ============================================================

-- document_requests
drop policy if exists document_requests_pro_write on public.document_requests;
create policy document_requests_pro_write on public.document_requests for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro')
  );

drop policy if exists document_requests_admin_read on public.document_requests;
create policy document_requests_admin_read on public.document_requests for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- documents
drop policy if exists documents_tenant_write on public.documents;
create policy documents_tenant_write on public.documents for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','customer')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','customer')
  );

drop policy if exists documents_admin_read on public.documents;
create policy documents_admin_read on public.documents for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- document_versions
drop policy if exists document_versions_tenant_insert on public.document_versions;
create policy document_versions_tenant_insert on public.document_versions for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','customer')
  );

drop policy if exists document_versions_pro_review on public.document_versions;
create policy document_versions_pro_review on public.document_versions for update
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro')
  );

drop policy if exists document_versions_admin_read on public.document_versions;
create policy document_versions_admin_read on public.document_versions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Storage bucket — tenant-documents. Drop 'admin' from the write gate;
-- add a platform-admin read sibling.
drop policy if exists tenant_documents_tenant_write on storage.objects;
create policy tenant_documents_tenant_write on storage.objects for insert
  with check (
    bucket_id = 'tenant-documents'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','customer')
  );

drop policy if exists tenant_documents_admin_read on storage.objects;
create policy tenant_documents_admin_read on storage.objects for select
  using (
    bucket_id = 'tenant-documents'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ============================================================
-- 8. Renewals foundation (0020) — retag write policy; add admin read.
-- ============================================================
drop policy if exists renewals_pro_write on public.renewals;
create policy renewals_pro_write on public.renewals for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro')
  );

drop policy if exists renewals_admin_read on public.renewals;
create policy renewals_admin_read on public.renewals for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- 9. tenant_documents head/version helper tables, if any future
--    addition: parent migration owns them. Nothing extra here.
-- ============================================================

-- ============================================================
-- VERIFICATION QUERIES (do not execute in this migration; run by hand)
-- ============================================================
-- -- 1. No platform role carries a tenant_id, no tenant role lacks one:
-- select role, count(*) as n, bool_and(tenant_id is null) as all_null,
--        bool_and(tenant_id is not null) as all_not_null
--   from public.profiles
--  group by role
--  order by role;
--
-- -- 2. ONE_PRO_PER_TENANT holds:
-- select tenant_id, count(*) as n
--   from public.profiles
--  where role = 'pro' and status = 'active'
--  group by tenant_id
--  having count(*) > 1;
-- -- expect zero rows.
--
-- -- 3. Singleton super_admin still holds (from 0014):
-- select count(*) from public.profiles where role = 'super_admin';
-- -- expect 1.
--
-- -- 4. JWT mirror is consistent for tenant-scoped pros:
-- select p.id, p.role, u.raw_app_meta_data ->> 'mandoob_role' as jwt_role
--   from public.profiles p
--   join auth.users u on u.id = p.id
--  where p.role = 'pro'
--    and coalesce(u.raw_app_meta_data ->> 'mandoob_role', '') <> 'pro';
-- -- expect zero rows.
--
-- -- 5. RLS sanity — no tenant-scoped policy still references 'admin':
-- select schemaname, tablename, policyname, qual, with_check
--   from pg_policies
--  where (qual ilike '%''admin''%' or with_check ilike '%''admin''%')
--    and (qual ilike '%tenant_id%' or with_check ilike '%tenant_id%');
-- -- expect zero rows.
