-- Final least-privilege policies and Step 1 assignment readiness reconciliation.
begin;

drop policy if exists company_profiles_pro_write on public.company_profiles;
revoke insert, update, delete on table public.company_profiles from public, anon, authenticated;

alter table public.company_shareholders enable row level security;
alter table public.company_registered_activities enable row level security;
alter table public.company_office_details enable row level security;
alter table public.company_onboarding_sections enable row level security;
alter table public.company_bank_details enable row level security;
alter table public.company_onboarding_operations enable row level security;

create policy company_shareholders_workspace_read
  on public.company_shareholders for select
  using (public.has_company_access(company_shareholders.tenant_id));
create policy company_registered_activities_workspace_read
  on public.company_registered_activities for select
  using (public.has_company_access(company_registered_activities.tenant_id));
create policy company_office_details_workspace_read
  on public.company_office_details for select
  using (public.has_company_access(company_office_details.tenant_id));
create policy company_onboarding_sections_workspace_read
  on public.company_onboarding_sections for select
  using (public.has_company_access(company_onboarding_sections.tenant_id));

revoke all on table public.company_shareholders from public, anon, authenticated;
revoke all on table public.company_registered_activities from public, anon, authenticated;
revoke all on table public.company_office_details from public, anon, authenticated;
revoke all on table public.company_onboarding_sections from public, anon, authenticated;
revoke all on table public.company_bank_details from public, anon, authenticated;
revoke all on table public.company_onboarding_operations from public, anon, authenticated;

grant select on table public.company_shareholders to authenticated;
grant select on table public.company_registered_activities to authenticated;
grant select on table public.company_office_details to authenticated;
grant select on table public.company_onboarding_sections to authenticated;
grant all on table public.company_shareholders to service_role;
grant all on table public.company_registered_activities to service_role;
grant all on table public.company_office_details to service_role;
grant all on table public.company_onboarding_sections to service_role;
grant all on table public.company_bank_details to service_role;
grant all on table public.company_onboarding_operations to service_role;

create or replace function public.assign_pro_to_company(
  p_company_id uuid,
  p_pro_profile_id uuid,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_tenant_status text;
  v_company_status public.company_status;
  v_assignment_id uuid;
  v_target_tenant_status text;
begin
  perform 1 from public.profiles
  where id = p_actor_profile_id
    and role in ('admin', 'super_admin')
    and status = 'active' and tenant_id is null
  for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;

  perform public.lock_company_assignment_resources(p_company_id, array[p_pro_profile_id]);

  select tenant_id, status into v_tenant_id, v_company_status
  from public.company_profiles where id = p_company_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY';
  end if;
  select status into v_tenant_status from public.tenants
  where id = v_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY';
  end if;
  if v_tenant_status = 'suspended' or v_company_status in ('suspended', 'churned') then
    raise exception using errcode = 'P0001', message = 'COMPANY_INACTIVE';
  end if;
  if v_tenant_status not in ('pending', 'unassigned', 'active') then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY';
  end if;

  perform 1 from public.profiles
  where id = p_pro_profile_id and role = 'pro' and status = 'active' for update;
  if not found then raise exception using errcode = 'P0001', message = 'PRO_INACTIVE'; end if;
  perform 1 from public.pro_profiles
  where profile_id = p_pro_profile_id and credentials_verified = true for update;
  if not found then raise exception using errcode = 'P0001', message = 'PRO_NOT_VERIFIED'; end if;
  perform 1 from public.pro_company_assignments
  where pro_profile_id = p_pro_profile_id and status = 'active' for update;
  if found then raise exception using errcode = 'P0001', message = 'PRO_ALREADY_ASSIGNED'; end if;
  perform 1 from public.pro_company_assignments
  where company_id = p_company_id and status = 'active' for update;
  if found then raise exception using errcode = 'P0001', message = 'COMPANY_ALREADY_ASSIGNED'; end if;

  insert into public.pro_company_assignments (
    tenant_id, company_id, pro_profile_id, assigned_by
  ) values (v_tenant_id, p_company_id, p_pro_profile_id, p_actor_profile_id)
  returning id into v_assignment_id;

  update public.profiles set tenant_id = v_tenant_id, updated_at = pg_catalog.now()
  where id = p_pro_profile_id;
  update auth.users set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || pg_catalog.jsonb_build_object('tenant_id', v_tenant_id),
    updated_at = pg_catalog.now()
  where id = p_pro_profile_id;

  v_target_tenant_status := case
    when v_company_status in ('active', 'renewal_due', 'renewal_overdue') then 'active'
    when v_company_status = 'onboarding' then 'pending'
    else 'pending'
  end;
  update public.tenants set status = v_target_tenant_status, updated_at = pg_catalog.now()
  where id = v_tenant_id;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (v_tenant_id, p_actor_profile_id, 'company_pro_assigned', 'admin',
    pg_catalog.jsonb_build_object('assignment_id', v_assignment_id,
      'company_id', p_company_id, 'pro_profile_id', p_pro_profile_id));
  return v_assignment_id;
end;
$$;

create or replace function public.reassign_company_pro(
  p_company_id uuid,
  p_expected_assignment_id uuid,
  p_replacement_pro_profile_id uuid,
  p_reason text,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_assignment_id uuid;
  v_tenant_id uuid;
  v_tenant_status text;
  v_company_status public.company_status;
  v_old_pro_profile_id uuid;
  v_lock_old_pro_profile_id uuid;
  v_new_assignment_id uuid;
  v_reason text;
  v_target_tenant_status text;
begin
  v_reason := pg_catalog.btrim(p_reason);
  if v_reason is null or char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_RELEASE_REASON';
  end if;
  perform 1 from public.profiles
  where id = p_actor_profile_id and role in ('admin', 'super_admin')
    and status = 'active' and tenant_id is null for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;

  perform public.lock_company_assignment_resources(p_company_id, array[]::uuid[]);
  select pro_profile_id into v_lock_old_pro_profile_id
  from public.pro_company_assignments
  where company_id = p_company_id and status = 'active';
  perform public.lock_company_assignment_resources(
    p_company_id, array[v_lock_old_pro_profile_id, p_replacement_pro_profile_id]
  );

  select tenant_id, status into v_tenant_id, v_company_status
  from public.company_profiles where id = p_company_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;
  select status into v_tenant_status from public.tenants
  where id = v_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY';
  end if;
  if v_tenant_status = 'suspended' or v_company_status in ('suspended', 'churned') then
    raise exception using errcode = 'P0001', message = 'COMPANY_INACTIVE';
  end if;

  select id, pro_profile_id into v_old_assignment_id, v_old_pro_profile_id
  from public.pro_company_assignments
  where company_id = p_company_id and status = 'active' for update;
  if not found then
    if exists (select 1 from public.pro_company_assignments where company_id = p_company_id) then
      raise exception using errcode = 'P0001', message = 'STALE_ASSIGNMENT';
    end if;
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;
  if v_old_assignment_id <> p_expected_assignment_id then
    raise exception using errcode = 'P0001', message = 'STALE_ASSIGNMENT';
  end if;
  if v_old_pro_profile_id = p_replacement_pro_profile_id then
    raise exception using errcode = 'P0001', message = 'PRO_ALREADY_ASSIGNED';
  end if;

  perform 1 from public.profiles
  where id in (v_old_pro_profile_id, p_replacement_pro_profile_id)
  order by id for update;
  perform 1 from public.profiles
  where id = p_replacement_pro_profile_id and role = 'pro' and status = 'active';
  if not found then raise exception using errcode = 'P0001', message = 'PRO_INACTIVE'; end if;
  perform 1 from public.pro_profiles
  where profile_id = p_replacement_pro_profile_id and credentials_verified = true for update;
  if not found then raise exception using errcode = 'P0001', message = 'PRO_NOT_VERIFIED'; end if;
  perform 1 from public.pro_company_assignments
  where pro_profile_id = p_replacement_pro_profile_id and status = 'active' for update;
  if found then raise exception using errcode = 'P0001', message = 'PRO_ALREADY_ASSIGNED'; end if;

  update public.pro_company_assignments set
    status = 'released', released_at = pg_catalog.now(), released_by = p_actor_profile_id,
    release_reason = v_reason, updated_at = pg_catalog.now()
  where id = v_old_assignment_id;
  update public.profiles set tenant_id = null, updated_at = pg_catalog.now()
  where id = v_old_pro_profile_id;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'tenant_id',
    updated_at = pg_catalog.now() where id = v_old_pro_profile_id;

  insert into public.pro_company_assignments (
    tenant_id, company_id, pro_profile_id, assigned_by
  ) values (v_tenant_id, p_company_id, p_replacement_pro_profile_id, p_actor_profile_id)
  returning id into v_new_assignment_id;
  update public.profiles set tenant_id = v_tenant_id, updated_at = pg_catalog.now()
  where id = p_replacement_pro_profile_id;
  update auth.users set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || pg_catalog.jsonb_build_object('tenant_id', v_tenant_id),
    updated_at = pg_catalog.now()
  where id = p_replacement_pro_profile_id;

  v_target_tenant_status := case
    when v_company_status in ('active', 'renewal_due', 'renewal_overdue') then 'active'
    when v_company_status = 'onboarding' then 'pending'
    else 'pending'
  end;
  update public.tenants set status = v_target_tenant_status, updated_at = pg_catalog.now()
  where id = v_tenant_id;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values
    (v_tenant_id, p_actor_profile_id, 'company_pro_released', 'admin',
      pg_catalog.jsonb_build_object('assignment_id', v_old_assignment_id,
        'company_id', p_company_id, 'pro_profile_id', v_old_pro_profile_id,
        'reason', v_reason, 'replacement_assignment_id', v_new_assignment_id)),
    (v_tenant_id, p_actor_profile_id, 'company_pro_assigned', 'admin',
      pg_catalog.jsonb_build_object('assignment_id', v_new_assignment_id,
        'company_id', p_company_id, 'pro_profile_id', p_replacement_pro_profile_id,
        'replaces_assignment_id', v_old_assignment_id));
  return v_new_assignment_id;
end;
$$;

alter function public.assign_pro_to_company(uuid, uuid, uuid) owner to postgres;
alter function public.reassign_company_pro(uuid, uuid, uuid, text, uuid) owner to postgres;
revoke all on function public.assign_pro_to_company(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reassign_company_pro(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_pro_to_company(uuid, uuid, uuid) to service_role;
grant execute on function public.reassign_company_pro(uuid, uuid, uuid, text, uuid) to service_role;

alter function public.read_company_onboarding(uuid, uuid, uuid) owner to postgres;
alter function public.evaluate_company_activation_readiness(uuid) owner to postgres;
alter function public.save_company_legal_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;
alter function public.save_company_shareholders_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;
alter function public.save_company_activities_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;
alter function public.save_company_office_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;
alter function public.save_company_establishment_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;
alter function public.save_company_bank_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;
alter function public.clear_company_bank_identifier(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;
alter function public.reopen_company_onboarding_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;
alter function public.submit_company_onboarding_for_activation(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;
alter function public.activate_company_onboarding(uuid, uuid, uuid, bigint, uuid, text, jsonb) owner to postgres;

revoke all on function public.read_company_onboarding(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.evaluate_company_activation_readiness(uuid) from public, anon, authenticated;
grant execute on function public.read_company_onboarding(uuid, uuid, uuid) to service_role;
grant execute on function public.evaluate_company_activation_readiness(uuid) to service_role;

commit;
