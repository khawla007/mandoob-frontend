-- Composite service-case ownership/creator references make tenant moves unsafe once a profile
-- has case history. Reject the profile move before immediate foreign keys run; callers can keep
-- the profile in its original tenant and create a separate profile for the destination tenant.
create or replace function public.guard_profile_tenant_transition_with_cases()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.tenant_id is not distinct from old.tenant_id then
    return new;
  end if;

  if exists (
    select 1
    from public.service_cases as service_case
    where service_case.assigned_to = old.id
       or service_case.created_by = old.id
  ) then
    raise exception using
      errcode = '23514',
      message = 'PROFILE_TENANT_HAS_SERVICE_CASE_REFERENCES';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_tenant_transition_with_cases()
  from public, anon, authenticated;

drop trigger if exists profiles_guard_tenant_transition_with_cases on public.profiles;
create trigger profiles_guard_tenant_transition_with_cases
  before update of tenant_id on public.profiles
  for each row
  execute function public.guard_profile_tenant_transition_with_cases();
