-- An active PRO may be suspended, replaced, or moved to another tenant after cases were assigned.
-- Preserve completed/cancelled history, but never leave open work attributed to an invalid owner.
update public.service_cases as service_case
set assigned_to = null
where service_case.assigned_to is not null
  and service_case.status not in ('completed', 'cancelled')
  and not exists (
    select 1
    from public.profiles as owner
    where owner.id = service_case.assigned_to
      and owner.tenant_id = service_case.tenant_id
      and owner.role = 'pro'
      and owner.status = 'active'
  );

create or replace function public.clear_open_cases_for_invalid_pro_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.role = 'pro'
    and old.status = 'active'
    and (
      new.role is distinct from 'pro'
      or new.status is distinct from 'active'
      or new.tenant_id is distinct from old.tenant_id
    )
  then
    update public.service_cases
    set assigned_to = null
    where assigned_to = old.id
      and tenant_id = old.tenant_id
      and status not in ('completed', 'cancelled');
  end if;
  return new;
end;
$$;

revoke all on function public.clear_open_cases_for_invalid_pro_transition() from public, anon, authenticated;

drop trigger if exists profiles_clear_invalid_pro_assignments on public.profiles;
create trigger profiles_clear_invalid_pro_assignments
  after update of role, status, tenant_id on public.profiles
  for each row
  execute function public.clear_open_cases_for_invalid_pro_transition();
