begin;

-- This trigger crosses from the application schema into Supabase Auth. Keep its
-- SECURITY DEFINER surface deterministic and unavailable to client roles.
create or replace function public.sync_profile_to_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users as auth_user
     set raw_app_meta_data = coalesce(auth_user.raw_app_meta_data, '{}'::jsonb)
       || pg_catalog.jsonb_build_object(
         'mandoob_role', new.role::text,
         'tenant_id', new.tenant_id,
         'mandoob_status', new.status::text
       )
   where auth_user.id = new.id;

  return new;
end;
$$;

alter function public.sync_profile_to_auth_metadata() owner to postgres;
revoke all on function public.sync_profile_to_auth_metadata() from public, anon, authenticated;
grant execute on function public.sync_profile_to_auth_metadata() to service_role;

-- GoTrue does not expose an Admin API for per-session revocation in every
-- supported deployment. Keep the fallback ownership-bound and unavailable to
-- browser roles; deleting the Auth session also cascades its refresh tokens.
create or replace function public.revoke_user_auth_session(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with revoked as (
    delete from auth.sessions as session
     where session.id = p_session_id
       and session.user_id = p_user_id
    returning 1
  )
  select exists(select 1 from revoked);
$$;

alter function public.revoke_user_auth_session(uuid, uuid) owner to postgres;
revoke all on function public.revoke_user_auth_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_auth_session(uuid, uuid) to service_role;

-- Global revocation uses the same database-backed session authority because the
-- GoTrue admin logout route is not available in every supported deployment.
create or replace function public.revoke_all_user_auth_sessions(
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_count bigint;
begin
  delete from auth.sessions as session
   where session.user_id = p_user_id;

  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;

alter function public.revoke_all_user_auth_sessions(uuid) owner to postgres;
revoke all on function public.revoke_all_user_auth_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_all_user_auth_sessions(uuid) to service_role;

commit;
