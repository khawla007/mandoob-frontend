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

commit;
