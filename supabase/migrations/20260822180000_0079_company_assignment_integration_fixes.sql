-- Forward-only Task 11 review fixes: canonical candidate context and mutation identities.

create or replace function public.evaluate_company_assignment_eligibility(
  p_pro_profile_id uuid,
  p_company_id uuid,
  p_expected_assignment_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_codes jsonb;
  v_current_pro_id uuid;
begin
  v_result := public.evaluate_pro_assignment_eligibility(p_pro_profile_id, p_company_id);
  if p_expected_assignment_id is null then return v_result; end if;
  select pro_profile_id into v_current_pro_id
  from public.pro_company_assignments
  where id = p_expected_assignment_id and company_id = p_company_id and status = 'active';
  if not found or v_current_pro_id = p_pro_profile_id then return v_result; end if;
  select coalesce(pg_catalog.jsonb_agg(code.value order by code.ordinality), '[]'::jsonb)
    into v_codes
  from pg_catalog.jsonb_array_elements_text(v_result -> 'codes')
    with ordinality as code(value, ordinality)
  where code.value <> 'COMPANY_ALREADY_ASSIGNED';
  return pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(v_result, '{codes}', v_codes, false),
    '{eligible}', pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(v_codes) = 0), false
  );
end;
$$;

create or replace function public.list_eligible_pros_for_company(
  p_actor_id uuid, p_company_id uuid, p_query text default null, p_limit integer default 50
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_expected_assignment_id uuid;
begin
  perform 1 from public.profiles where id = p_actor_id
    and role in ('admin', 'super_admin') and status = 'active' and tenant_id is null;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  if p_limit < 1 or p_limit > 100 or pg_catalog.char_length(coalesce(p_query, '')) > 160 then
    raise exception using errcode = '22023', message = 'INVALID_SELECTOR_INPUT';
  end if;
  select id into v_expected_assignment_id from public.pro_company_assignments
  where company_id = p_company_id and status = 'active';
  return coalesce((select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'proProfileId', candidate.id, 'fullName', candidate.full_name,
      'designation', candidate.designation, 'department', candidate.department,
      'eligibility', candidate.eligibility
    ) order by candidate.full_name nulls last, candidate.id)
    from (
      select profile.id, profile.full_name, pro.designation, pro.department,
        public.evaluate_company_assignment_eligibility(
          profile.id, p_company_id, v_expected_assignment_id
        ) as eligibility
      from public.profiles profile
      join public.pro_profiles pro on pro.profile_id = profile.id
      where profile.role = 'pro' and (
        p_query is null or pg_catalog.btrim(p_query) = '' or
        pg_catalog.strpos(pg_catalog.lower(coalesce(profile.full_name, '')),
          pg_catalog.lower(pg_catalog.btrim(p_query))) > 0
      )
      order by profile.full_name nulls last, profile.id limit p_limit
    ) candidate), '[]'::jsonb);
end;
$$;

create or replace function public.read_current_company_assignment_summary(
  p_actor_id uuid, p_company_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_assignment public.pro_company_assignments%rowtype;
  v_pro_full_name text;
  v_eligibility jsonb;
  v_operational_codes jsonb;
begin
  perform 1 from public.profiles where id = p_actor_id
    and role in ('admin', 'super_admin') and status = 'active' and tenant_id is null;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  select assignment.* into v_assignment
  from public.pro_company_assignments assignment
  where assignment.company_id = p_company_id and assignment.status = 'active';
  if not found then return null; end if;
  select profile.full_name into v_pro_full_name
  from public.profiles profile
  where profile.id = v_assignment.pro_profile_id;
  v_eligibility := public.evaluate_company_assignment_eligibility(
    v_assignment.pro_profile_id, p_company_id, null
  );
  select coalesce(pg_catalog.jsonb_agg(code.value order by code.ordinality), '[]'::jsonb)
    into v_operational_codes
  from pg_catalog.jsonb_array_elements_text(v_eligibility -> 'codes')
    with ordinality as code(value, ordinality)
  where code.value in (
    'PRO_ACCOUNT_INACTIVE', 'PRO_CREDENTIAL_MISSING', 'PRO_CREDENTIAL_DRAFT',
    'PRO_CREDENTIAL_SUBMITTED', 'PRO_CREDENTIAL_UNDER_REVIEW',
    'PRO_CREDENTIAL_REJECTED', 'PRO_CREDENTIAL_EXPIRED', 'PRO_CREDENTIAL_REVOKED'
  );
  return pg_catalog.jsonb_build_object(
    'assignmentId', v_assignment.id, 'tenantId', v_assignment.tenant_id,
    'companyId', v_assignment.company_id, 'proProfileId', v_assignment.pro_profile_id,
    'proFullName', v_pro_full_name, 'status', v_assignment.status::text,
    'assignedAt', v_assignment.assigned_at, 'assignedBy', v_assignment.assigned_by,
    'releasedAt', v_assignment.released_at, 'releasedBy', v_assignment.released_by,
    'releaseReason', v_assignment.release_reason,
    'operationalAccess', case when pg_catalog.jsonb_array_length(v_operational_codes) = 0
      then 'allowed' else 'blocked' end,
    'operationalAccessCodes', v_operational_codes
  );
end;
$$;

create or replace function public.assign_pro_to_company_with_context(
  p_company_id uuid, p_pro_profile_id uuid, p_actor_profile_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_pro_profile_id uuid;
begin
  v_result := public.assign_pro_to_company(p_company_id, p_pro_profile_id, p_actor_profile_id);
  select pro_profile_id into strict v_pro_profile_id
  from public.pro_company_assignments
  where id = (v_result ->> 'assignmentId')::uuid;
  return v_result || pg_catalog.jsonb_build_object('proProfileId', v_pro_profile_id);
end;
$$;

create or replace function public.release_company_pro_with_context(
  p_company_id uuid, p_expected_assignment_id uuid, p_reason text, p_actor_profile_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_pro_profile_id uuid; v_assignment_id uuid;
begin
  v_assignment_id := public.release_company_pro(
    p_company_id, p_expected_assignment_id, p_reason, p_actor_profile_id
  );
  select pro_profile_id into strict v_pro_profile_id
  from public.pro_company_assignments
  where id = v_assignment_id and company_id = p_company_id;
  return pg_catalog.jsonb_build_object(
    'assignmentId', v_assignment_id, 'previousProProfileId', v_pro_profile_id
  );
end;
$$;

create or replace function public.reassign_company_pro_with_context(
  p_company_id uuid, p_expected_assignment_id uuid, p_replacement_pro_profile_id uuid,
  p_reason text, p_actor_profile_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_previous_pro_profile_id uuid; v_pro_profile_id uuid; v_result jsonb;
begin
  v_result := public.reassign_company_pro(
    p_company_id, p_expected_assignment_id, p_replacement_pro_profile_id,
    p_reason, p_actor_profile_id
  );
  select pro_profile_id into strict v_previous_pro_profile_id
  from public.pro_company_assignments
  where id = p_expected_assignment_id and company_id = p_company_id;
  select pro_profile_id into strict v_pro_profile_id
  from public.pro_company_assignments
  where id = (v_result ->> 'assignmentId')::uuid and company_id = p_company_id;
  return v_result || pg_catalog.jsonb_build_object(
    'proProfileId', v_pro_profile_id,
    'previousProProfileId', v_previous_pro_profile_id
  );
end;
$$;

alter function public.evaluate_company_assignment_eligibility(uuid, uuid, uuid) owner to postgres;
alter function public.assign_pro_to_company_with_context(uuid, uuid, uuid) owner to postgres;
alter function public.release_company_pro_with_context(uuid, uuid, text, uuid) owner to postgres;
alter function public.reassign_company_pro_with_context(uuid, uuid, uuid, text, uuid) owner to postgres;
revoke all on function public.evaluate_company_assignment_eligibility(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.assign_pro_to_company_with_context(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_company_pro_with_context(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.reassign_company_pro_with_context(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.evaluate_company_assignment_eligibility(uuid, uuid, uuid) to service_role;
grant execute on function public.assign_pro_to_company_with_context(uuid, uuid, uuid) to service_role;
grant execute on function public.release_company_pro_with_context(uuid, uuid, text, uuid) to service_role;
grant execute on function public.reassign_company_pro_with_context(uuid, uuid, uuid, text, uuid) to service_role;
