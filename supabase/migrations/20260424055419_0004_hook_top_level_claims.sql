create or replace function public.mandoob_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  p record;
begin
  select role::text, tenant_id, status::text
    into p
    from public.profiles
   where id = (event->>'user_id')::uuid;
  if p.role is not null then
    claims := claims
      || jsonb_build_object('mandoob_role', p.role)
      || jsonb_build_object('tenant_id', p.tenant_id)
      || jsonb_build_object('mandoob_status', p.status);
  end if;
  return jsonb_set(event, '{claims}', claims);
end
$$;

-- Update RLS policies that previously read app_metadata.
drop policy if exists tenants_read_member on public.tenants;
create policy tenants_read_member on public.tenants for select
  using (id = ((auth.jwt() ->> 'tenant_id')::uuid));

drop policy if exists profiles_read_tenant on public.profiles;
create policy profiles_read_tenant on public.profiles for select
  using (tenant_id is not null
         and tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

drop policy if exists invites_rw_tenant on public.invites;
create policy invites_rw_tenant on public.invites for all
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
