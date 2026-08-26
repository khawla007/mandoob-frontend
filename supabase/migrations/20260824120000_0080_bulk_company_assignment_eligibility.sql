-- Forward-only Task 11 selector hardening: one bounded, set-based eligibility query.

create or replace function public.list_eligible_pros_for_company(
  p_actor_id uuid, p_company_id uuid, p_query text default null, p_limit integer default 50
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform 1 from public.profiles where id = p_actor_id
    and role in ('admin', 'super_admin') and status = 'active' and tenant_id is null;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  if p_limit < 1 or p_limit > 100 or pg_catalog.char_length(coalesce(p_query, '')) > 160 then
    raise exception using errcode = '22023', message = 'INVALID_SELECTOR_INPUT';
  end if;

  with candidate_ids as materialized (
    select profile.id, profile.full_name, profile.status
    from public.profiles profile
    join public.pro_profiles pro on pro.profile_id = profile.id
    where profile.role = 'pro' and (
      p_query is null or pg_catalog.btrim(p_query) = '' or
      pg_catalog.strpos(pg_catalog.lower(coalesce(profile.full_name, '')),
        pg_catalog.lower(pg_catalog.btrim(p_query))) > 0
    )
    order by profile.full_name nulls last, profile.id
    limit p_limit
  ),
  credential_state as materialized (
    select distinct on (credential.pro_profile_id)
      credential.pro_profile_id, credential.id, credential.state, credential.expiry_date
    from public.pro_credentials credential
    join candidate_ids candidate on candidate.id = credential.pro_profile_id
    where credential.credential_type = 'pro_license'
    order by credential.pro_profile_id, credential.created_at desc, credential.id desc
  ),
  verified_credentials as materialized (
    select distinct on (credential.pro_profile_id) credential.pro_profile_id, credential.id
    from public.pro_credentials credential
    join candidate_ids candidate on candidate.id = credential.pro_profile_id
    where credential.credential_type = 'pro_license' and credential.state = 'verified'
      and credential.expiry_date >= pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date
    order by credential.pro_profile_id, credential.expiry_date desc, credential.id
  ),
  pricing_terms as materialized (
    select distinct on (term.pro_profile_id) term.pro_profile_id, term.id
    from public.pro_commercial_terms term
    join candidate_ids candidate on candidate.id = term.pro_profile_id
    where term.term_kind = 'pricing' and term.status = 'active'
      and term.effective_from <= pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date
      and (term.effective_to is null or term.effective_to >= pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date)
    order by term.pro_profile_id, term.effective_from desc, term.id desc
  ),
  compensation_terms as materialized (
    select distinct on (term.pro_profile_id) term.pro_profile_id, term.id
    from public.pro_commercial_terms term
    join candidate_ids candidate on candidate.id = term.pro_profile_id
    where term.term_kind = 'compensation' and term.status = 'active'
      and term.effective_from <= pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date
      and (term.effective_to is null or term.effective_to >= pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date)
    order by term.pro_profile_id, term.effective_from desc, term.id desc
  ),
  pro_assignment_conflicts as materialized (
    select assignment.pro_profile_id, pg_catalog.count(*) as active_count
    from public.pro_company_assignments assignment
    join candidate_ids candidate on candidate.id = assignment.pro_profile_id
    where assignment.status = 'active'
    group by assignment.pro_profile_id
  ),
  expected_assignment as materialized (
    select assignment.id, assignment.pro_profile_id
    from public.pro_company_assignments assignment
    where assignment.company_id = p_company_id and assignment.status = 'active'
  ),
  company_state as materialized (
    select company.status::text as company_status, tenant.status::text as tenant_status
    from public.company_profiles company
    join public.tenants tenant on tenant.id = company.tenant_id
    where company.id = p_company_id
  ),
  enriched as materialized (
    select candidate.id, candidate.full_name, candidate.status,
      latest.id as latest_credential_id, latest.state as latest_credential_state,
      latest.expiry_date as latest_credential_expiry, verified.id as verified_credential_id,
      pricing.id as pricing_term_id, compensation.id as compensation_term_id,
      coalesce(conflict.active_count, 0) > 0 as pro_assigned,
      expected.id as expected_assignment_id, expected.pro_profile_id as expected_pro_id,
      company.company_status, company.tenant_status
    from candidate_ids candidate
    left join credential_state latest on latest.pro_profile_id = candidate.id
    left join verified_credentials verified on verified.pro_profile_id = candidate.id
    left join pricing_terms pricing on pricing.pro_profile_id = candidate.id
    left join compensation_terms compensation on compensation.pro_profile_id = candidate.id
    left join pro_assignment_conflicts conflict on conflict.pro_profile_id = candidate.id
    left join expected_assignment expected on true
    left join company_state company on true
  ),
  code_rows as (
    select id, 1 ord, 'PRO_ACCOUNT_INACTIVE' code from enriched where status <> 'active'
    union all select id, 2, 'PRO_CREDENTIAL_MISSING' from enriched
      where verified_credential_id is null and latest_credential_id is null
    union all select id, 3, 'PRO_CREDENTIAL_DRAFT' from enriched
      where verified_credential_id is null and latest_credential_state = 'draft'
    union all select id, 4, 'PRO_CREDENTIAL_SUBMITTED' from enriched
      where verified_credential_id is null and latest_credential_state = 'submitted'
    union all select id, 5, 'PRO_CREDENTIAL_UNDER_REVIEW' from enriched
      where verified_credential_id is null and latest_credential_state = 'under_review'
    union all select id, 6, 'PRO_CREDENTIAL_REJECTED' from enriched
      where verified_credential_id is null and latest_credential_state = 'rejected'
    union all select id, 7, 'PRO_CREDENTIAL_EXPIRED' from enriched
      where verified_credential_id is null and (latest_credential_state = 'expired' or
        (latest_credential_state = 'verified' and latest_credential_expiry < pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date))
    union all select id, 8, 'PRO_CREDENTIAL_REVOKED' from enriched
      where verified_credential_id is null and latest_credential_state = 'revoked'
    union all select id, 2, 'PRO_CREDENTIAL_MISSING' from enriched
      where verified_credential_id is null and latest_credential_id is not null
        and latest_credential_state not in ('draft','submitted','under_review','rejected','expired','verified','revoked')
    union all select id, 9, 'PRO_ALREADY_ASSIGNED' from enriched where pro_assigned
    union all select id, 10, 'PRICING_TERMS_MISSING' from enriched where pricing_term_id is null
    union all select id, 11, 'COMPENSATION_TERMS_MISSING' from enriched where compensation_term_id is null
    union all select id, 12, 'COMPANY_INACTIVE' from enriched
      where company_status is null or company_status in ('suspended','churned')
        or tenant_status not in ('pending','unassigned','active')
    union all select id, 13, 'COMPANY_ALREADY_ASSIGNED' from enriched
      where expected_assignment_id is not null
        and (expected_pro_id = id or expected_pro_id is null)
  ),
  codes as (
    select id, pg_catalog.jsonb_agg(code order by ord) as value
    from code_rows group by id
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'proProfileId', enriched.id, 'fullName', enriched.full_name,
    'eligibility', pg_catalog.jsonb_build_object(
      'eligible', codes.value is null, 'codes', coalesce(codes.value, '[]'::jsonb),
      'verifiedCredentialId', enriched.verified_credential_id,
      'pricingTermId', enriched.pricing_term_id,
      'compensationTermId', enriched.compensation_term_id
    )
  ) order by enriched.full_name nulls last, enriched.id), '[]'::jsonb)
  into v_result from enriched left join codes on codes.id = enriched.id;
  return v_result;
end;
$$;

alter function public.list_eligible_pros_for_company(uuid, uuid, text, integer) owner to postgres;
revoke all on function public.list_eligible_pros_for_company(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.list_eligible_pros_for_company(uuid, uuid, text, integer)
  to service_role;
