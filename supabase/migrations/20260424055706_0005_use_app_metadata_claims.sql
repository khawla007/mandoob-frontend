-- Revert RLS policies to read tenant_id from app_metadata (auto-populated by
-- Supabase from raw_app_meta_data, which we write on profile create/update).

drop policy if exists tenants_read_member on public.tenants;
create policy tenants_read_member on public.tenants for select
  using (id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

drop policy if exists profiles_read_tenant on public.profiles;
create policy profiles_read_tenant on public.profiles for select
  using (tenant_id is not null
         and tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

drop policy if exists invites_rw_tenant on public.invites;
create policy invites_rw_tenant on public.invites for all
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

-- Make the hook a safe no-op. The dashboard toggle can stay on; harmless.
create or replace function public.mandoob_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
begin
  return event;
end $$;

-- Trigger: whenever profiles.{role,tenant_id,status} changes, mirror into
-- auth.users.raw_app_meta_data so new JWTs carry the claim.
create or replace function public.sync_profile_to_auth_metadata()
returns trigger language plpgsql security definer as $$
begin
  update auth.users u
     set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object(
         'mandoob_role', new.role::text,
         'tenant_id', new.tenant_id,
         'mandoob_status', new.status::text
       )
   where u.id = new.id;
  return new;
end $$;

grant execute on function public.sync_profile_to_auth_metadata() to service_role;

drop trigger if exists profiles_sync_app_metadata on public.profiles;
create trigger profiles_sync_app_metadata
  after insert or update of role, tenant_id, status on public.profiles
  for each row execute function public.sync_profile_to_auth_metadata();
