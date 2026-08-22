-- Forward-only integration of the Step 3 evaluator with company assignment reads.

create or replace function public.list_eligible_pros_for_company(
  p_actor_id uuid,
  p_company_id uuid,
  p_query text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.profiles
  where id = p_actor_id
    and role in ('admin', 'super_admin')
    and status = 'active'
    and tenant_id is null;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if p_limit < 1 or p_limit > 100
     or pg_catalog.char_length(coalesce(p_query, '')) > 160 then
    raise exception using errcode = '22023', message = 'INVALID_SELECTOR_INPUT';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'proProfileId', candidate.id,
        'fullName', candidate.full_name,
        'designation', candidate.designation,
        'department', candidate.department,
        'eligibility', candidate.eligibility
      ) order by candidate.full_name nulls last, candidate.id
    )
    from (
      select evaluated.id,
             evaluated.full_name,
             evaluated.designation,
             evaluated.department,
             pg_catalog.jsonb_set(
               pg_catalog.jsonb_set(
                 evaluated.raw_eligibility,
                 '{codes}',
                 evaluated.effective_codes,
                 false
               ),
               '{eligible}',
               pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(evaluated.effective_codes) = 0),
               false
             ) as eligibility
      from (
        select profile.id,
               profile.full_name,
               pro.designation,
               pro.department,
               eligibility.value as raw_eligibility,
               coalesce((
                 select pg_catalog.jsonb_agg(code.value order by code.ordinality)
                 from pg_catalog.jsonb_array_elements_text(
                   eligibility.value -> 'codes'
                 ) with ordinality as code(value, ordinality)
                 where code.value <> 'COMPANY_ALREADY_ASSIGNED'
                    or exists (
                      select 1
                      from public.pro_company_assignments current_assignment
                      where current_assignment.company_id = p_company_id
                        and current_assignment.pro_profile_id = profile.id
                        and current_assignment.status = 'active'
                    )
               ), '[]'::jsonb) as effective_codes
        from public.profiles profile
        join public.pro_profiles pro on pro.profile_id = profile.id
        cross join lateral (
          select public.evaluate_pro_assignment_eligibility(profile.id, p_company_id) as value
        ) eligibility
        where profile.role = 'pro'
          and (
            p_query is null
            or pg_catalog.btrim(p_query) = ''
            or pg_catalog.strpos(
              pg_catalog.lower(coalesce(profile.full_name, '')),
              pg_catalog.lower(pg_catalog.btrim(p_query))
            ) > 0
          )
        order by profile.full_name nulls last, profile.id
        limit p_limit
      ) evaluated
    ) candidate
  ), '[]'::jsonb);
end;
$$;

create or replace function public.read_current_company_assignment_summary(
  p_actor_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assignment public.pro_company_assignments%rowtype;
  v_pro_full_name text;
  v_eligibility jsonb;
  v_operational_codes jsonb;
begin
  perform 1
  from public.profiles
  where id = p_actor_id
    and role in ('admin', 'super_admin')
    and status = 'active'
    and tenant_id is null;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select assignment, profile.full_name
    into v_assignment, v_pro_full_name
  from public.pro_company_assignments assignment
  join public.profiles profile on profile.id = assignment.pro_profile_id
  where assignment.company_id = p_company_id
    and assignment.status = 'active';
  if not found then
    return null;
  end if;

  v_eligibility := public.evaluate_pro_assignment_eligibility(
    v_assignment.pro_profile_id, p_company_id
  );
  select coalesce(pg_catalog.jsonb_agg(code.value order by code.ordinality), '[]'::jsonb)
    into v_operational_codes
  from pg_catalog.jsonb_array_elements_text(v_eligibility -> 'codes')
    with ordinality as code(value, ordinality)
  where code.value in (
    'PRO_ACCOUNT_INACTIVE',
    'PRO_CREDENTIAL_MISSING',
    'PRO_CREDENTIAL_DRAFT',
    'PRO_CREDENTIAL_SUBMITTED',
    'PRO_CREDENTIAL_UNDER_REVIEW',
    'PRO_CREDENTIAL_REJECTED',
    'PRO_CREDENTIAL_EXPIRED',
    'PRO_CREDENTIAL_REVOKED'
  );

  return pg_catalog.jsonb_build_object(
    'assignmentId', v_assignment.id,
    'tenantId', v_assignment.tenant_id,
    'companyId', v_assignment.company_id,
    'proProfileId', v_assignment.pro_profile_id,
    'proFullName', v_pro_full_name,
    'status', v_assignment.status::text,
    'assignedAt', v_assignment.assigned_at,
    'assignedBy', v_assignment.assigned_by,
    'releasedAt', v_assignment.released_at,
    'releasedBy', v_assignment.released_by,
    'releaseReason', v_assignment.release_reason,
    'operationalAccess', case
      when pg_catalog.jsonb_array_length(v_operational_codes) = 0 then 'allowed'
      else 'blocked'
    end,
    'operationalAccessCodes', v_operational_codes
  );
end;
$$;

alter function public.list_eligible_pros_for_company(uuid, uuid, text, integer)
  owner to postgres;
alter function public.read_current_company_assignment_summary(uuid, uuid)
  owner to postgres;

revoke all on function public.list_eligible_pros_for_company(uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.read_current_company_assignment_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_eligible_pros_for_company(uuid, uuid, text, integer)
  to service_role;
grant execute on function public.read_current_company_assignment_summary(uuid, uuid)
  to service_role;
