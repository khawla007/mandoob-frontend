-- Counted operator PRO registry and one-shot lifecycle detail reads.
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

  with candidates as (
    select
      profile.id,
      profile.full_name,
      profile.status::text as account_status,
      profile.created_at,
      auth_user.email,
      auth_user.id is null or auth_user.email is null as email_unavailable,
      credential.state::text as credential_state,
      credential.expiry_date as credential_expiry,
      eligibility.value as eligibility,
      assignment.id as assignment_id,
      assignment.company_id,
      coalesce(company.display_name, company.company_name) as company_name
    from public.profiles profile
    join public.pro_profiles pro on pro.profile_id = profile.id
    left join auth.users auth_user on auth_user.id = profile.id
    left join lateral (
      select current_credential.state, current_credential.expiry_date, current_credential.id
      from public.pro_credentials current_credential
      where current_credential.pro_profile_id = profile.id
      order by
        case when current_credential.state in ('draft', 'submitted', 'under_review', 'verified') then 0 else 1 end,
        current_credential.created_at desc,
        current_credential.id desc
      limit 1
    ) credential on true
    left join public.pro_company_assignments assignment
      on assignment.pro_profile_id = profile.id and assignment.status = 'active'
    left join public.company_profiles company on company.id = assignment.company_id
    cross join lateral (
      select public.evaluate_pro_assignment_eligibility(profile.id, null) as value
    ) eligibility
    where profile.role = 'pro'
      and (
        p_query is null
        or pg_catalog.btrim(p_query) = ''
        or pg_catalog.strpos(
          pg_catalog.lower(coalesce(profile.full_name, '')),
          pg_catalog.lower(pg_catalog.btrim(p_query))
        ) > 0
        or pg_catalog.strpos(
          pg_catalog.lower(coalesce(auth_user.email, '')),
          pg_catalog.lower(pg_catalog.btrim(p_query))
        ) > 0
      )
      and (
        p_account_status is null
        or p_account_status = 'active' and profile.status = 'active'
        or p_account_status = 'invited' and profile.status = 'invited'
        or p_account_status = 'inactive' and profile.status in ('disabled', 'suspended')
      )
      and (p_credential_state is null or credential.state::text = p_credential_state)
      and (
        p_eligibility is null
        or p_eligibility = 'eligible' and (eligibility.value ->> 'eligible')::boolean
        or p_eligibility = 'ineligible' and not (eligibility.value ->> 'eligible')::boolean
      )
      and (
        p_assignment is null
        or p_assignment = 'assigned' and assignment.id is not null
        or p_assignment = 'unassigned' and assignment.id is null
      )
      and (
        p_expiry_window is null
        or p_expiry_window = 'expired' and credential.expiry_date < v_today
        or p_expiry_window = '30_days'
          and credential.expiry_date between v_today and v_today + 30
        or p_expiry_window = '60_days'
          and credential.expiry_date between v_today and v_today + 60
        or p_expiry_window = '90_days'
          and credential.expiry_date between v_today and v_today + 90
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
      ) as ordinal,
      pg_catalog.count(*) over () as exact_count
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
          'eligible', (item.eligibility ->> 'eligible')::boolean,
          'eligibilityCodes', item.eligibility -> 'codes',
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
          pg_catalog.encode(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
            'eventAt', timeline_result.last_at,
            'eventId', timeline_result.last_id
          )::text, 'UTF8'), 'base64'), '+/', '-_'
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
