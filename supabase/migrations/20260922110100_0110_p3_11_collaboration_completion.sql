-- P3.11 consent, leased-AI privacy, notes, and review completion.
begin;

alter table public.meeting_ai_summaries
  add column if not exists transcript_retain_until timestamptz,
  add column if not exists transcript_deleted_at timestamptz;

alter table public.meeting_action_items
  add column if not exists owner_label text,
  add column if not exists due_date date,
  add column if not exists priority text not null default 'medium'
    check (priority in ('low','medium','high')),
  add column if not exists source_quote text;

create index if not exists meeting_action_items_proposed_summary_idx
  on public.meeting_action_items(proposed_by_summary_id,state,created_at);
create unique index if not exists meeting_action_items_summary_title_uniq
  on public.meeting_action_items(meeting_id,proposed_by_summary_id,title);
create unique index if not exists meeting_provider_callback_replay_uniq
  on public.meeting_provider_callback_receipts(
    provider,coalesce(destination_id,'00000000-0000-0000-0000-000000000000'::uuid),provider_event_id_hash
  );

create or replace function private.p311_add_assigned_host()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_profile uuid;
begin
  if new.company_id is null then return new; end if;
  if exists (
    select 1 from public.pro_company_assignments where tenant_id=new.tenant_id
      and company_id=new.company_id and pro_profile_id=new.created_by and status::text='active'
  ) then return new; end if;
  select pro_profile_id into v_profile from public.pro_company_assignments
    where tenant_id=new.tenant_id and company_id=new.company_id and status::text='active'
    order by created_at desc limit 1;
  if v_profile is not null then
    insert into public.meeting_participants(
      meeting_id,tenant_id,company_id,profile_id,participant_role,starts_at,ends_at
    ) values(
      new.id,new.tenant_id,new.company_id,v_profile,'host',new.scheduled_at,
      new.scheduled_at + make_interval(mins=>new.duration_minutes)
    ) on conflict (meeting_id,profile_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists p311_meeting_assigned_host on public.meetings;
create trigger p311_meeting_assigned_host after insert on public.meetings
for each row execute function private.p311_add_assigned_host();

insert into public.meeting_participants(
  meeting_id,tenant_id,company_id,profile_id,participant_role,starts_at,ends_at
)
select m.id,m.tenant_id,m.company_id,a.pro_profile_id,'host',m.scheduled_at,
  m.scheduled_at + make_interval(mins=>m.duration_minutes)
from public.meetings m
join public.pro_company_assignments a on a.tenant_id=m.tenant_id and a.company_id=m.company_id
  and a.status::text='active'
where m.company_id is not null and m.status::text<>'cancelled'
on conflict (meeting_id,profile_id) do nothing;

create or replace function public.p311_set_consent(
  p_actor_id uuid,p_meeting_id uuid,p_granted boolean,p_policy_version text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare m public.meetings%rowtype; v_role text; v_now timestamptz:=clock_timestamp();
begin
  select * into m from public.meetings where id=p_meeting_id for share;
  if not found or m.company_id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  v_role:=private.p311_actor_role(p_actor_id,m.tenant_id,m.company_id,array['pro','customer','employee','admin','super_admin']);
  if v_role not in ('admin','super_admin') and not exists (
    select 1 from public.meeting_participants where meeting_id=m.id and profile_id=p_actor_id and active
  ) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if length(btrim(p_policy_version)) not between 1 and 80 then
    raise exception using errcode='22023',message='INVALID_POLICY_VERSION';
  end if;
  insert into public.meeting_consents(
    meeting_id,participant_profile_id,purpose,policy_version,granted,captured_at,source,withdrawn_at
  ) select m.id,p_actor_id,purpose,btrim(p_policy_version),p_granted,v_now,'prejoin',
      case when p_granted then null else v_now end
    from unnest(array['recording','transcription','ai_summary']) as requested(purpose);
  insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details)
    values(m.tenant_id,p_actor_id,case when p_granted then 'meeting_consent_granted' else 'meeting_consent_withdrawn' end,
      'self_serve',jsonb_build_object('entity','meeting','meeting_id',m.id,'policy_version',btrim(p_policy_version)));
  return true;
end $$;

create or replace function public.p311_has_processing_consent(p_meeting_id uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists(select 1 from public.meeting_participants where meeting_id=p_meeting_id and active)
    and not exists (
      select 1 from public.meeting_participants p
      cross join unnest(array['recording','transcription','ai_summary']) as required(purpose)
      where p.meeting_id=p_meeting_id and p.active and not coalesce((
        select c.granted and c.withdrawn_at is null from public.meeting_consents c
        where c.meeting_id=p.meeting_id and c.participant_profile_id=p.profile_id
          and c.purpose=required.purpose
        order by c.captured_at desc limit 1
      ),false)
    )
$$;

create or replace function public.p311_add_meeting_note(
  p_actor_id uuid,p_meeting_id uuid,p_body text,p_visibility text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.meetings%rowtype; v_role text; v_id uuid;
begin
  select * into m from public.meetings where id=p_meeting_id for share;
  if not found or m.company_id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  v_role:=private.p311_actor_role(p_actor_id,m.tenant_id,m.company_id,array['pro','customer','employee','admin','super_admin']);
  if v_role not in ('admin','super_admin') and not exists (
    select 1 from public.meeting_participants where meeting_id=m.id and profile_id=p_actor_id and active
  ) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if p_visibility='internal' and v_role not in ('pro','admin','super_admin') then
    raise exception using errcode='42501',message='FORBIDDEN';
  end if;
  insert into public.meeting_notes(meeting_id,author_profile_id,body,visibility)
    values(m.id,p_actor_id,btrim(p_body),p_visibility) returning id into v_id;
  insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details)
    values(m.tenant_id,p_actor_id,'meeting_note_added','self_serve',
      jsonb_build_object('entity','meeting','meeting_id',m.id,'note_id',v_id,'visibility',p_visibility));
  return v_id;
end $$;

create or replace function public.p311_review_action_item(
  p_actor_id uuid,p_meeting_id uuid,p_action_item_id uuid,p_decision text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare m public.meetings%rowtype;
begin
  select * into m from public.meetings where id=p_meeting_id for share;
  if not found or m.company_id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  perform private.p311_actor_role(p_actor_id,m.tenant_id,m.company_id,array['pro','admin','super_admin']);
  if p_decision not in ('accepted','dismissed') then raise exception using errcode='22023',message='INVALID_DECISION'; end if;
  update public.meeting_action_items set state=p_decision,accepted_by=p_actor_id,accepted_at=clock_timestamp()
    where id=p_action_item_id and meeting_id=m.id and state='proposed';
  if not found then raise exception using errcode='40001',message='ACTION_ALREADY_REVIEWED'; end if;
  insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details)
    values(m.tenant_id,p_actor_id,'meeting_action_reviewed','self_serve',
      jsonb_build_object('entity','meeting','meeting_id',m.id,'action_item_id',p_action_item_id,'decision',p_decision));
  return true;
end $$;

create or replace function public.p311_delete_expired_transcripts(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with expired as (
    select id from public.meeting_ai_summaries where transcript_retain_until<=now()
      and transcript_text is not null order by transcript_retain_until limit least(greatest(p_limit,1),500)
      for update skip locked
  ) update public.meeting_ai_summaries s set transcript_text=null,transcript_deleted_at=now()
    from expired e where s.id=e.id;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function public.p311_request_ai_processing(
  p_meeting_id uuid,p_operation_id uuid,p_actor_id uuid default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare m public.meetings%rowtype; s public.meeting_ai_summaries%rowtype;
begin
  select * into m from public.meetings where id=p_meeting_id for update;
  if not found or not public.p311_has_processing_consent(m.id) then return false; end if;
  if p_actor_id is not null then
    perform private.p311_actor_role(p_actor_id,m.tenant_id,m.company_id,array['pro','admin','super_admin']);
  end if;
  insert into public.meeting_ai_summaries(tenant_id,meeting_id,status,attempts,customer_visible)
    values(m.tenant_id,m.id,'pending',0,false)
    on conflict (meeting_id) do update set status='pending',error_code=null,error=null
    returning * into s;
  perform private.p311_publish(
    'meeting.ai.requested',m.tenant_id,m.company_id,null,p_operation_id,m.id,m.version,'pending'
  );
  return true;
end $$;

create or replace function public.p311_complete_ai_processing(
  p_job_id uuid,p_worker_id uuid,p_lease_token uuid,p_meeting_id uuid,
  p_transcript text,p_summary text,p_decisions jsonb,p_actions jsonb,p_risks jsonb,
  p_language text,p_provider text,p_model text,p_retain_until timestamptz,p_effect_hash text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.meeting_ai_summaries%rowtype;
begin
  if not exists (
    select 1 from public.event_jobs j join public.domain_events e on e.id=j.event_id
    where j.id=p_job_id and j.state='leased' and j.lease_owner=p_worker_id
      and j.lease_token=p_lease_token and j.lease_expires_at>now()
      and j.consumer_name='p311.meeting_ai.processor'
      and e.payload->>'resource_id'=p_meeting_id::text
  ) then raise exception using errcode='55000',message='STALE_EVENT_JOB_LEASE'; end if;
  if not public.p311_has_processing_consent(p_meeting_id) then
    raise exception using errcode='42501',message='CONSENT_REQUIRED';
  end if;
  update public.meeting_ai_summaries set status='completed',transcript_text=left(p_transcript,200000),
    summary_text=left(p_summary,10000),decisions=p_decisions,action_items=p_actions,
    risks_or_followups=p_risks,language=left(p_language,32),provider=left(p_provider,50),
    model=left(p_model,100),error_code=null,error=null,transcript_retain_until=p_retain_until,
    transcript_deleted_at=null,updated_at=now()
    where meeting_id=p_meeting_id returning * into s;
  if not found then raise exception using errcode='P0002',message='SUMMARY_NOT_FOUND'; end if;
  insert into public.meeting_action_items(
    meeting_id,proposed_by_summary_id,title,owner_label,due_date,priority,source_quote,state
  ) select p_meeting_id,s.id,left(a.title,180),left(a.owner_label,120),
      case when a.due_date~'^\d{4}-\d{2}-\d{2}$' then a.due_date::date end,
      case when a.priority in ('low','medium','high') then a.priority else 'medium' end,
      left(a.source_quote,240),'proposed'
    from jsonb_to_recordset(p_actions) as a(
      title text,owner_label text,due_date text,priority text,source_quote text
    ) where length(btrim(a.title))>0
    on conflict (meeting_id,proposed_by_summary_id,title) do nothing;
  perform public.complete_event_job(p_job_id,p_worker_id,p_lease_token,p_effect_hash);
  return true;
end $$;

revoke all on function public.p311_set_consent(uuid,uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.p311_has_processing_consent(uuid) from public,anon,authenticated;
revoke all on function public.p311_add_meeting_note(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.p311_review_action_item(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.p311_delete_expired_transcripts(integer) from public,anon,authenticated;
revoke all on function public.p311_request_ai_processing(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.p311_complete_ai_processing(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.p311_set_consent(uuid,uuid,boolean,text) to service_role;
grant execute on function public.p311_has_processing_consent(uuid) to service_role;
grant execute on function public.p311_add_meeting_note(uuid,uuid,text,text) to service_role;
grant execute on function public.p311_review_action_item(uuid,uuid,uuid,text) to service_role;
grant execute on function public.p311_delete_expired_transcripts(integer) to service_role;
grant execute on function public.p311_request_ai_processing(uuid,uuid,uuid) to service_role;
grant execute on function public.p311_complete_ai_processing(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,text,text,text,timestamptz,text) to service_role;

commit;
