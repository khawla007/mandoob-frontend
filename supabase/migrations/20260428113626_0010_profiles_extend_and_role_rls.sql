-- Extends profiles with new identity fields, updates role-tenant check
-- to recognize `admin`, and adds RLS policies for the super_admin/admin
-- hierarchy.
--
-- super_admin singleton index intentionally NOT created here: DB has two
-- existing super_admin rows. Consolidate one to `admin` then run:
--   create unique index profiles_one_super_admin
--     on public.profiles (role) where role = 'super_admin';

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists locale text not null default 'en',
  add column if not exists last_login_ip inet;

-- Replace tenant-required constraint to allow admin to be tenantless.
alter table public.profiles drop constraint if exists profiles_tenant_required;
alter table public.profiles add constraint profiles_tenant_required
  check (role in ('super_admin','admin') or tenant_id is not null);

-- Role hierarchy RLS:
-- super_admin: full read+write on every profile.
-- admin: read all; update any non-super_admin row.
drop policy if exists profiles_super_admin_write on public.profiles;
create policy profiles_super_admin_write on public.profiles for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists profiles_admin_write_non_super on public.profiles;
create policy profiles_admin_write_non_super on public.profiles for update
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and role <> 'super_admin'
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and role <> 'super_admin'
  );
