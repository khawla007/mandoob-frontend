-- P3.11 final route contracts: replay-safe slots and participant-scoped mutations.
begin;

create or replace function private.p311_assert_meeting_actor(
  p_actor_id uuid,p_meeting public.meetings,p_allowed text[]
) returns text language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if p_meeting.company_id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  v_role:=private.p311_actor_role(
    p_actor_id,p_meeting.tenant_id,p_meeting.company_id,p_allowed
  );
  if v_role in ('customer','employee') and not exists (
    select 1 from public.meeting_participants where meeting_id=p_meeting.id
      and profile_id=p_actor_id and active
  ) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  return v_role;
end $$;

create or replace function public.p311_create_slot(
  p_actor_id uuid,p_operation_id uuid,p_payload_hash text,
  p_tenant_id uuid,p_company_id uuid,p_starts_at timestamptz,p_ends_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.meeting_slots%rowtype; replay jsonb; response jsonb; v_minutes integer;
begin
  replay:=private.p311_receipt(p_actor_id,p_operation_id,'meeting.slot_create',p_payload_hash);
  if replay is not null then return replay; end if;
  perform private.p311_actor_role(p_actor_id,p_tenant_id,p_company_id,array['pro','admin','super_admin']);
  v_minutes:=(extract(epoch from (p_ends_at-p_starts_at))/60)::integer;
  if p_starts_at<=now() or v_minutes not between 15 and 180 then
    raise exception using errcode='22023',message='INVALID_SLOT';
  end if;
  insert into public.meeting_slots(
    tenant_id,created_by,starts_at,ends_at,timezone,status,version,operation_id
  ) values(
    p_tenant_id,p_actor_id,p_starts_at,p_ends_at,'Asia/Dubai','open',1,p_operation_id
  ) returning * into s;
  response:=jsonb_build_object('slot_id',s.id,'version',s.version);
  insert into public.p311_operation_receipts values(
    p_actor_id,p_operation_id,'meeting.slot_create',p_payload_hash,response,now()
  );
  insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details)
    values(p_tenant_id,p_actor_id,'meeting_slot_created','self_serve',
      jsonb_build_object('entity','meeting_slot','slot_id',s.id,'company_id',p_company_id));
  return response;
end $$;

create or replace function public.p311_reschedule_meeting(
  p_actor_id uuid,p_operation_id uuid,p_payload_hash text,
  p_meeting_id uuid,p_expected_version integer,p_starts_at timestamptz,p_ends_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.meetings%rowtype; replay jsonb; response jsonb; v_minutes integer;
begin
  replay:=private.p311_receipt(p_actor_id,p_operation_id,'meeting.reschedule',p_payload_hash);
  if replay is not null then return replay; end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  if not found then raise exception using errcode='P0002',message='MEETING_NOT_FOUND'; end if;
  perform private.p311_assert_meeting_actor(
    p_actor_id,m,array['pro','customer','admin','super_admin']
  );
  v_minutes:=(extract(epoch from (p_ends_at-p_starts_at))/60)::integer;
  if m.version<>p_expected_version or m.status::text<>'scheduled'
    or p_starts_at<=now() or v_minutes not between 15 and 180 then
    raise exception using errcode='40001',message='MEETING_CONFLICT';
  end if;
  update public.meetings set scheduled_at=p_starts_at,duration_minutes=v_minutes,
    version=version+1,room_state='compensation_pending' where id=m.id returning * into m;
  update public.meeting_participants set starts_at=p_starts_at,ends_at=p_ends_at
    where meeting_id=m.id and active;
  perform private.p311_publish(
    'meeting.rescheduled',m.tenant_id,m.company_id,p_actor_id,p_operation_id,m.id,m.version,'scheduled'
  );
  response:=jsonb_build_object('meeting_id',m.id,'version',m.version,'room_state',m.room_state);
  insert into public.p311_operation_receipts values(
    p_actor_id,p_operation_id,'meeting.reschedule',p_payload_hash,response,now()
  );
  return response;
end $$;

create or replace function public.p311_cancel_meeting(
  p_actor_id uuid,p_operation_id uuid,p_payload_hash text,
  p_meeting_id uuid,p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.meetings%rowtype; replay jsonb; response jsonb;
begin
  replay:=private.p311_receipt(p_actor_id,p_operation_id,'meeting.cancel',p_payload_hash);
  if replay is not null then return replay; end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  if not found then raise exception using errcode='P0002',message='MEETING_NOT_FOUND'; end if;
  perform private.p311_assert_meeting_actor(
    p_actor_id,m,array['pro','customer','admin','super_admin']
  );
  if m.version<>p_expected_version or m.status::text<>'scheduled' then
    raise exception using errcode='40001',message='MEETING_CONFLICT';
  end if;
  update public.meetings set status='cancelled',cancelled_at=now(),version=version+1,
    room_state='compensation_pending' where id=m.id returning * into m;
  update public.meeting_participants set active=false where meeting_id=m.id;
  perform private.p311_publish(
    'meeting.cancelled',m.tenant_id,m.company_id,p_actor_id,p_operation_id,m.id,m.version,'cancelled'
  );
  response:=jsonb_build_object('meeting_id',m.id,'version',m.version,'room_state',m.room_state);
  insert into public.p311_operation_receipts values(
    p_actor_id,p_operation_id,'meeting.cancel',p_payload_hash,response,now()
  );
  return response;
end $$;

revoke all on function public.p311_create_slot(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.p311_create_slot(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz) to service_role;

commit;
