create or replace function public.mandoob_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  app_meta jsonb := coalesce(claims->'app_metadata', '{}'::jsonb);
  p record;
begin
  select role, tenant_id, status
    into p
    from public.profiles
   where id = (event->>'user_id')::uuid;
  if p.role is not null then
    app_meta := app_meta || jsonb_build_object(
      'role', p.role,
      'tenant_id', p.tenant_id,
      'status', p.status
    );
    claims := jsonb_set(claims, '{app_metadata}', app_meta);
  end if;
  return jsonb_set(event, '{claims}', claims);
end
$$;

revoke execute on function public.mandoob_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.mandoob_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;
