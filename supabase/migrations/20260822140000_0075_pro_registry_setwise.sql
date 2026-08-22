-- Set-wise operator PRO registry eligibility and newline-safe detail cursors.
begin;

create or replace function public.read_pro_registry(
  p_actor_id uuid,
  p_query text default null,
  p_account_status text default null,
  p_credential_state text default null,
  p_eligibility text default null,
  p_assignment text default null,
  p_expiry_window text default null,
  p_sort text default 'created_at',
  p_direction text default 'desc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date;
  v_offset bigint;
  v_result jsonb;
begin
  perform 1
  from public.profiles actor
  where actor.id = p_actor_id
    and actor.role in ('admin', 'super_admin')
    and actor.status = 'active'
    and actor.tenant_id is null;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if pg_catalog.char_length(coalesce(p_query, '')) > 160
     or p_account_status is not null and p_account_status not in ('invited', 'active', 'inactive')
     or p_credential_state is not null and p_credential_state not in (
       'draft', 'submitted', 'under_review', 'verified', 'rejected', 'expired', 'revoked'
     )
     or p_eligibility is not null and p_eligibility not in ('eligible', 'ineligible')
     or p_assignment is not null and p_assignment not in ('assigned', 'unassigned')
     or p_expiry_window is not null and p_expiry_window not in ('expired', '30_days', '60_days', '90_days')
     or p_sort is null or p_sort not in ('created_at', 'full_name', 'credential_expiry', 'state')
     or p_direction is null or p_direction not in ('asc', 'desc')
     or p_page is null or p_page < 1 or p_page > 1000000
     or p_page_size is distinct from 25 then
    raise exception using errcode = '22023', message = 'INVALID_SELECTOR_INPUT';
  end if;
  v_offset := (p_page::bigint - 1) * p_page_size;

  with latest_credentials as (
    select distinct on (credential.pro_profile_id)
      credential.pro_profile_id,
      credential.id,
      credential.state,
      credential.expiry_date
    from public.pro_credentials credential
    where credential.credential_type = 'pro_license'
    order by credential.pro_profile_id, credential.created_at desc, credential.id desc
  ), verified_credentials as (
    select distinct on (credential.pro_profile_id)
      credential.pro_profile_id,
      credential.id,
      credential.state,
      credential.expiry_date
    from public.pro_credentials credential
    where credential.credential_type = 'pro_license'
      and credential.state = 'verified'
      and credential.expiry_date >= v_today
    order by credential.pro_profile_id, credential.expiry_date desc, credential.id
  ), current_credentials as (
    select distinct on (credential.pro_profile_id)
      credential.pro_profile_id,
      credential.state,
      credential.expiry_date
    from public.pro_credentials credential
    where credential.credential_type = 'pro_license'
    order by credential.pro_profile_id,
      case when credential.state in ('draft', 'submitted', 'under_review', 'verified')
        then 0 else 1 end,
      credential.created_at desc,
      credential.id desc
  ), active_assignments as (
    select assignment.id, assignment.pro_profile_id, assignment.company_id
    from public.pro_company_assignments assignment
    where assignment.status = 'active'
  ), active_terms as (
    select distinct on (term.pro_profile_id, term.term_kind)
      term.pro_profile_id,
      term.term_kind,
      term.id
    from public.pro_commercial_terms term
    where term.status = 'active'
      and term.effective_from <= v_today
      and (term.effective_to is null or term.effective_to >= v_today)
    order by term.pro_profile_id, term.term_kind, term.effective_from desc, term.id desc
  ), term_ids as (
    select
      term.pro_profile_id,
      (pg_catalog.array_agg(term.id) filter (where term.term_kind = 'pricing'))[1]
        as pricing_term_id,
      (pg_catalog.array_agg(term.id) filter (where term.term_kind = 'compensation'))[1]
        as compensation_term_id
    from active_terms term
    group by term.pro_profile_id
  ), registry_rows as (
    select
      profile.id,
      profile.full_name,
      profile.status::text as account_status,
      profile.created_at,
      auth_user.email,
      auth_user.id is null or auth_user.email is null as email_unavailable,
      current_credential.state::text as credential_state,
      current_credential.expiry_date as credential_expiry,
      verified.id as verified_credential_id,
      latest.id as latest_credential_id,
      latest.state::text as latest_credential_state,
      latest.expiry_date as latest_credential_expiry,
      assignment.id as assignment_id,
      assignment.company_id,
      coalesce(company.display_name, company.company_name) as company_name,
      terms.pricing_term_id,
      terms.compensation_term_id
    from public.profiles profile
    join public.pro_profiles pro on pro.profile_id = profile.id
    left join auth.users auth_user on auth_user.id = profile.id
    left join latest_credentials latest on latest.pro_profile_id = profile.id
    left join verified_credentials verified on verified.pro_profile_id = profile.id
    left join current_credentials current_credential
      on current_credential.pro_profile_id = profile.id
    left join active_assignments assignment on assignment.pro_profile_id = profile.id
    left join public.company_profiles company on company.id = assignment.company_id
    left join term_ids terms on terms.pro_profile_id = profile.id
    where profile.role = 'pro'
  ), eligibility_rows as (
    select row_data.*,
      case when row_data.account_status <> 'active'
        then pg_catalog.jsonb_build_array('PRO_ACCOUNT_INACTIVE'::text)
        else '[]'::jsonb end
      || case
        when row_data.verified_credential_id is not null then '[]'::jsonb
        when row_data.latest_credential_id is null
          then pg_catalog.jsonb_build_array('PRO_CREDENTIAL_MISSING'::text)
        when row_data.latest_credential_state = 'draft'
          then pg_catalog.jsonb_build_array('PRO_CREDENTIAL_DRAFT'::text)
        when row_data.latest_credential_state = 'submitted'
          then pg_catalog.jsonb_build_array('PRO_CREDENTIAL_SUBMITTED'::text)
        when row_data.latest_credential_state = 'under_review'
          then pg_catalog.jsonb_build_array('PRO_CREDENTIAL_UNDER_REVIEW'::text)
        when row_data.latest_credential_state = 'rejected'
          then pg_catalog.jsonb_build_array('PRO_CREDENTIAL_REJECTED'::text)
        when row_data.latest_credential_state = 'expired'
          or row_data.latest_credential_state = 'verified'
            and row_data.latest_credential_expiry < v_today
          then pg_catalog.jsonb_build_array('PRO_CREDENTIAL_EXPIRED'::text)
        when row_data.latest_credential_state = 'revoked'
          then pg_catalog.jsonb_build_array('PRO_CREDENTIAL_REVOKED'::text)
        else pg_catalog.jsonb_build_array('PRO_CREDENTIAL_MISSING'::text)
      end
      || case when row_data.assignment_id is not null
        then pg_catalog.jsonb_build_array('PRO_ALREADY_ASSIGNED'::text)
        else '[]'::jsonb end
      || case when row_data.pricing_term_id is null
        then pg_catalog.jsonb_build_array('PRICING_TERMS_MISSING'::text)
        else '[]'::jsonb end
      || case when row_data.compensation_term_id is null
        then pg_catalog.jsonb_build_array('COMPENSATION_TERMS_MISSING'::text)
        else '[]'::jsonb end as eligibility_codes
    from registry_rows row_data
  ), candidates as (
    select row_data.*
    from eligibility_rows row_data
    where (
        p_query is null
        or pg_catalog.btrim(p_query) = ''
        or pg_catalog.strpos(
          pg_catalog.lower(coalesce(row_data.full_name, '')),
          pg_catalog.lower(pg_catalog.btrim(p_query))
        ) > 0
        or pg_catalog.strpos(
          pg_catalog.lower(coalesce(row_data.email, '')),
          pg_catalog.lower(pg_catalog.btrim(p_query))
        ) > 0
      )
      and (
        p_account_status is null
        or p_account_status = 'active' and row_data.account_status = 'active'
        or p_account_status = 'invited' and row_data.account_status = 'invited'
        or p_account_status = 'inactive' and row_data.account_status in ('disabled', 'suspended')
      )
      and (p_credential_state is null or row_data.credential_state = p_credential_state)
      and (
        p_eligibility is null
        or p_eligibility = 'eligible' and pg_catalog.jsonb_array_length(row_data.eligibility_codes) = 0
        or p_eligibility = 'ineligible' and pg_catalog.jsonb_array_length(row_data.eligibility_codes) > 0
      )
      and (
        p_assignment is null
        or p_assignment = 'assigned' and row_data.assignment_id is not null
        or p_assignment = 'unassigned' and row_data.assignment_id is null
      )
      and (
        p_expiry_window is null
        or p_expiry_window = 'expired' and row_data.credential_expiry < v_today
        or p_expiry_window = '30_days'
          and row_data.credential_expiry between v_today and v_today + 30
        or p_expiry_window = '60_days'
          and row_data.credential_expiry between v_today and v_today + 60
        or p_expiry_window = '90_days'
          and row_data.credential_expiry between v_today and v_today + 90
      )
  ), counted as (
    select pg_catalog.count(*) as total from candidates
  ), ranked as (
    select candidate.*,
      pg_catalog.row_number() over (
        order by
          case when p_sort = 'created_at' and p_direction = 'asc' then candidate.created_at end asc nulls last,
          case when p_sort = 'created_at' and p_direction = 'desc' then candidate.created_at end desc nulls last,
          case when p_sort = 'full_name' and p_direction = 'asc' then pg_catalog.lower(candidate.full_name) end asc nulls last,
          case when p_sort = 'full_name' and p_direction = 'desc' then pg_catalog.lower(candidate.full_name) end desc nulls last,
          case when p_sort = 'credential_expiry' and p_direction = 'asc' then candidate.credential_expiry end asc nulls last,
          case when p_sort = 'credential_expiry' and p_direction = 'desc' then candidate.credential_expiry end desc nulls last,
          case when p_sort = 'state' and p_direction = 'asc' then candidate.credential_state end asc nulls last,
          case when p_sort = 'state' and p_direction = 'desc' then candidate.credential_state end desc nulls last,
          case when p_direction = 'asc' then candidate.id end asc,
          case when p_direction = 'desc' then candidate.id end desc
      ) as ordinal
    from candidates candidate
  ), page as (
    select * from ranked
    order by ordinal
    offset v_offset limit p_page_size
  )
  select pg_catalog.jsonb_build_object(
    'items', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', item.id,
          'fullName', item.full_name,
          'email', item.email,
          'emailUnavailable', item.email_unavailable,
          'accountStatus', item.account_status,
          'credentialState', item.credential_state,
          'credentialExpiry', item.credential_expiry,
          'eligible', pg_catalog.jsonb_array_length(item.eligibility_codes) = 0,
          'eligibilityCodes', item.eligibility_codes,
          'assigned', item.assignment_id is not null,
          'companyId', item.company_id,
          'companyName', item.company_name,
          'createdAt', item.created_at
        ) order by item.ordinal
      ) from page item
    ), '[]'::jsonb),
    'total', counted.total,
    'page', p_page,
    'pageSize', p_page_size,
    'totalPages', case when counted.total = 0 then 0
      else pg_catalog.ceil(counted.total::numeric / p_page_size)::integer end
  ) into v_result
  from counted;
  return v_result;
end;
$$;

create or replace function public.read_pro_lifecycle_detail(
  p_actor_id uuid,
  p_pro_profile_id uuid,
  p_timeline_limit integer default 25
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
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform 1 from public.profiles target
  where target.id = p_pro_profile_id and target.role = 'pro';
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if p_timeline_limit is distinct from 25 then
    raise exception using errcode = '22023', message = 'INVALID_SELECTOR_INPUT';
  end if;

  with timeline_events as (
    select decision.created_at as event_at, decision.id as event_id,
      'credential_' || decision.event::text as event_kind,
      pg_catalog.upper(decision.event::text) as summary_code,
      actor.full_name as actor_display_name,
      null::text as company_display_name
    from public.pro_credential_decisions decision
    left join public.profiles actor on actor.id = decision.actor_profile_id
    where decision.pro_profile_id = p_pro_profile_id
    union all
    select assignment.assigned_at, assignment.id, 'assignment_assigned', 'ASSIGNED',
      actor.full_name, coalesce(company.display_name, company.company_name)
    from public.pro_company_assignments assignment
    left join public.profiles actor on actor.id = assignment.assigned_by
    left join public.company_profiles company on company.id = assignment.company_id
    where assignment.pro_profile_id = p_pro_profile_id
    union all
    select assignment.released_at, assignment.id, 'assignment_released', 'RELEASED',
      actor.full_name, coalesce(company.display_name, company.company_name)
    from public.pro_company_assignments assignment
    left join public.profiles actor on actor.id = assignment.released_by
    left join public.company_profiles company on company.id = assignment.company_id
    where assignment.pro_profile_id = p_pro_profile_id and assignment.released_at is not null
  ), timeline_page as (
    select * from timeline_events
    order by event_at desc, event_id desc
    limit p_timeline_limit
  ), timeline_result as (
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'eventAt', event_at,
        'eventId', event_id,
        'eventKind', event_kind,
        'summaryCode', summary_code,
        'actorDisplayName', actor_display_name,
        'companyDisplayName', company_display_name
      ) order by event_at desc, event_id desc
    ), '[]'::jsonb) as items,
    pg_catalog.count(*) as item_count,
    (pg_catalog.array_agg(event_at order by event_at desc, event_id desc))[p_timeline_limit] as last_at,
    (pg_catalog.array_agg(event_id order by event_at desc, event_id desc))[p_timeline_limit] as last_id
    from timeline_page
  )
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
    'credentials', coalesce((
      select pg_catalog.jsonb_agg(public.pro_credential_masked_result(credential.id)
        order by credential.created_at desc, credential.id desc)
      from public.pro_credentials credential
      where credential.pro_profile_id = p_pro_profile_id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'evidenceId', evidence.id,
        'credentialId', evidence.credential_id,
        'mimeType', evidence.mime_type,
        'sizeBytes', evidence.size_bytes,
        'originalNameSafe', evidence.original_name_safe,
        'createdAt', evidence.created_at
      ) order by evidence.created_at desc, evidence.id desc)
      from public.pro_credential_evidence evidence
      where evidence.pro_profile_id = p_pro_profile_id
    ), '[]'::jsonb),
    'eligibility', public.evaluate_pro_assignment_eligibility(p_pro_profile_id, null),
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
      where assignment.pro_profile_id = p_pro_profile_id and assignment.status = 'active'
      limit 1
    ),
    'commercialTerms', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'termId', term.id,
        'termKind', term.term_kind::text,
        'model', term.model::text,
        'currency', term.currency,
        'amountMinor', term.amount_minor,
        'retainerInterval', term.retainer_interval::text,
        'scope', term.scope,
        'effectiveFrom', term.effective_from,
        'effectiveTo', term.effective_to,
        'status', term.status::text,
        'version', term.version
      ) order by term.term_kind, term.effective_from desc, term.id desc)
      from public.pro_commercial_terms term
      where term.pro_profile_id = p_pro_profile_id
    ), '[]'::jsonb),
    'timeline', pg_catalog.jsonb_build_object(
      'items', timeline_result.items,
      'nextCursor', case when timeline_result.item_count = p_timeline_limit then
        pg_catalog.rtrim(pg_catalog.translate(
          pg_catalog.replace(pg_catalog.replace(
            pg_catalog.encode(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
              'eventAt', timeline_result.last_at,
              'eventId', timeline_result.last_id
            )::text, 'UTF8'), 'base64'),
            pg_catalog.chr(10), ''),
          pg_catalog.chr(13), ''), '+/', '-_'
        ), '=') else null end
    )
  ) into v_result
  from public.profiles profile
  join public.pro_profiles pro on pro.profile_id = profile.id
  left join auth.users auth_user on auth_user.id = profile.id
  cross join timeline_result
  where profile.id = p_pro_profile_id and profile.role = 'pro';
  if v_result is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  return v_result;
end;
$$;

alter function public.read_pro_registry(uuid, text, text, text, text, text, text, text, text, integer, integer)
  owner to postgres;
alter function public.read_pro_lifecycle_detail(uuid, uuid, integer) owner to postgres;

revoke all on function public.read_pro_registry(uuid, text, text, text, text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.read_pro_lifecycle_detail(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.read_pro_registry(uuid, text, text, text, text, text, text, text, text, integer, integer)
  to service_role;
grant execute on function public.read_pro_lifecycle_detail(uuid, uuid, integer)
  to service_role;

commit;
