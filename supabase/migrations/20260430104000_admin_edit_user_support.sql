-- 0015_admin_edit_user_support.sql
-- Sub-Project 4 — Admin Edit User
--
-- Adds:
--   * profile_status value 'suspended'
--   * profiles.suspension_reason text
--   * admin_audit_action values change_role | change_status | reset_mfa
--   * auth_event_kind values admin_created (retroactive fix from Sub-Project 3),
--     admin_user_edited, admin_user_role_changed, admin_user_status_changed
--
-- Postgres requires ALTER TYPE … ADD VALUE to run outside a transaction.
-- Supabase's migration runner executes each statement separately, so the
-- enum bumps and the column add can coexist in this file.

alter type public.profile_status add value if not exists 'suspended';

alter table public.profiles add column if not exists suspension_reason text;

alter type public.admin_audit_action add value if not exists 'change_role';
alter type public.admin_audit_action add value if not exists 'change_status';
alter type public.admin_audit_action add value if not exists 'reset_mfa';

alter type public.auth_event_kind add value if not exists 'admin_created';
alter type public.auth_event_kind add value if not exists 'admin_user_edited';
alter type public.auth_event_kind add value if not exists 'admin_user_role_changed';
alter type public.auth_event_kind add value if not exists 'admin_user_status_changed';
