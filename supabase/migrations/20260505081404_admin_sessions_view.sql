-- Step 17 — Super Admin Observability Suite
-- Expose auth.sessions to PostgREST for the /admin/sessions viewer (service role only).
-- The auth schema is not in pgrst.db_schemas by default; a public view is the
-- standard Supabase pattern for surfacing GoTrue tables to admin clients.

create or replace view public.admin_active_sessions as
  select
    s.id,
    s.user_id,
    s.created_at,
    s.refreshed_at,
    s.not_after,
    s.user_agent,
    s.ip
  from auth.sessions s;

-- The view inherits invoker privileges by default, but PostgREST exposes views
-- to the API role even without explicit grants. Lock it down so anon + authenticated
-- cannot read; only service_role.
revoke all on public.admin_active_sessions from anon, authenticated;
grant select on public.admin_active_sessions to service_role;
