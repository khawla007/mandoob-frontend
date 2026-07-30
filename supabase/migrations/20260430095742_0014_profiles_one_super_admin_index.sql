-- Enforce a single super_admin row at the database layer.
-- Deferred from migration 0010 (see comment block there) until duplicate
-- super_admin rows were resolved. Resolution: the duplicate row was demoted
-- to `admin` (audited via admin_audit_actions) prior to applying this index.

create unique index if not exists profiles_one_super_admin
  on public.profiles (role)
  where role = 'super_admin';
