-- Minimal mandatory identity and operational summary read for the PRO detail page.
begin;

create function public.read_pro_lifecycle_identity(
  p_actor_id uuid,
  p_pro_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform 1
  from public.profiles actor
  where actor.id = p_actor_id
    and actor.role in ('admin', 'super_admin')
    and actor.status = 'active'
    and actor.tenant_id is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  select pg_catalog.jsonb_build_object(
    'profile', pg_catalog.jsonb_build_object(
      'id', profile.id,
      'fullName', profile.full_name,
      'email', auth_user.email,
      'emailUnavailable', auth_user.id is null or auth_user.email is null,
      'accountStatus', profile.status::text,
      'designation', pro.designation,
      'department', pro.department,
      'serviceAreas', coalesce(pg_catalog.to_jsonb(pro.service_areas), '[]'::jsonb),
      'bio', pro.bio,
      'createdAt', profile.created_at
    ),
    'eligibility', public.evaluate_pro_assignment_eligibility(profile.id, null),
    'assignment', (
      select pg_catalog.jsonb_build_object(
        'assignmentId', assignment.id,
        'tenantId', assignment.tenant_id,
        'companyId', assignment.company_id,
        'companyName', coalesce(company.display_name, company.company_name),
        'assignedAt', assignment.assigned_at
      )
      from public.pro_company_assignments assignment
      left join public.company_profiles company on company.id = assignment.company_id
      where assignment.pro_profile_id = profile.id
        and assignment.status = 'active'
      order by assignment.assigned_at desc, assignment.id desc
      limit 1
    )
  ) into v_result
  from public.profiles profile
  join public.pro_profiles pro on pro.profile_id = profile.id
  left join auth.users auth_user on auth_user.id = profile.id
  where profile.id = p_pro_profile_id
    and profile.role = 'pro';

  if v_result is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  return v_result;
end;
$$;

alter function public.read_pro_lifecycle_identity(uuid, uuid) owner to postgres;
revoke all on function public.read_pro_lifecycle_identity(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_pro_lifecycle_identity(uuid, uuid)
  to service_role;

commit;
