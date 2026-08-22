begin;

create or replace function public.read_pro_lifecycle_timeline(
  p_actor_id uuid,
  p_pro_profile_id uuid,
  p_limit integer default 25,
  p_cursor_event_at timestamptz default null,
  p_cursor_event_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  perform public.authorize_pro_lifecycle_actor(p_actor_id, p_pro_profile_id, false);
  if p_limit < 1 or p_limit > 100
     or ((p_cursor_event_at is null) <> (p_cursor_event_id is null)) then
    raise exception using errcode = 'P0001', message = 'INVALID_CURSOR';
  end if;

  with events as (
    select decision.created_at as event_at,
           decision.id as event_id,
           'credential_' || decision.event::text as event_kind,
           pg_catalog.upper(decision.event::text) as summary_code,
           decision.reason_code::text as reason_code,
           decision.reason::text as reason,
           actor.full_name as actor_display_name,
           null::text as company_display_name
    from public.pro_credential_decisions decision
    left join public.profiles actor on actor.id = decision.actor_profile_id
    where decision.pro_profile_id = p_pro_profile_id

    union all

    select assignment.assigned_at,
           assignment.id,
           'assignment_assigned',
           'ASSIGNED',
           null::text,
           null::text,
           actor.full_name,
           coalesce(company.display_name, company.company_name)
    from public.pro_company_assignments assignment
    left join public.profiles actor on actor.id = assignment.assigned_by
    left join public.company_profiles company on company.id = assignment.company_id
    where assignment.pro_profile_id = p_pro_profile_id

    union all

    select assignment.released_at,
           assignment.id,
           'assignment_released',
           'RELEASED',
           null::text,
           null::text,
           actor.full_name,
           coalesce(company.display_name, company.company_name)
    from public.pro_company_assignments assignment
    left join public.profiles actor on actor.id = assignment.released_by
    left join public.company_profiles company on company.id = assignment.company_id
    where assignment.pro_profile_id = p_pro_profile_id
      and assignment.released_at is not null
  ), page as (
    select * from events
    where p_cursor_event_at is null
       or (event_at, event_id) < (p_cursor_event_at, p_cursor_event_id)
    order by event_at desc, event_id desc
    limit p_limit
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'eventAt', event_at,
        'eventId', event_id,
        'eventKind', event_kind,
        'summaryCode', summary_code,
        'reasonCode', reason_code,
        'reason', reason,
        'actorDisplayName', actor_display_name,
        'companyDisplayName', company_display_name
      ) order by event_at desc, event_id desc
    ),
    '[]'::jsonb
  ) into v_items from page;

  return pg_catalog.jsonb_build_object('items', v_items);
end;
$$;

alter function public.read_pro_lifecycle_timeline(uuid, uuid, integer, timestamptz, uuid)
  owner to postgres;
revoke all on function public.read_pro_lifecycle_timeline(uuid, uuid, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_pro_lifecycle_timeline(uuid, uuid, integer, timestamptz, uuid)
  to service_role;

alter function public.read_pro_lifecycle_detail(uuid, uuid, integer)
  rename to read_pro_lifecycle_detail_without_reasons_0076;

create function public.read_pro_lifecycle_detail(
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
  v_snapshot jsonb;
  v_timeline jsonb;
begin
  v_snapshot := public.read_pro_lifecycle_detail_without_reasons_0076(
    p_actor_id,
    p_pro_profile_id,
    p_timeline_limit
  );
  v_timeline := public.read_pro_lifecycle_timeline(
    p_actor_id,
    p_pro_profile_id,
    p_timeline_limit,
    null,
    null
  );
  return pg_catalog.jsonb_set(
    v_snapshot,
    '{timeline,items}',
    coalesce(v_timeline -> 'items', '[]'::jsonb),
    false
  );
end;
$$;

alter function public.read_pro_lifecycle_detail_without_reasons_0076(uuid, uuid, integer)
  owner to postgres;
revoke all on function public.read_pro_lifecycle_detail_without_reasons_0076(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
alter function public.read_pro_lifecycle_detail(uuid, uuid, integer) owner to postgres;
revoke all on function public.read_pro_lifecycle_detail(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.read_pro_lifecycle_detail(uuid, uuid, integer)
  to service_role;

commit;
