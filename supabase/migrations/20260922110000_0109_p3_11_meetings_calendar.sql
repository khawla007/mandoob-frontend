-- P3.11 meetings/calendar completion. Forward-only; provider activation remains configuration-owned.
begin;

create extension if not exists btree_gist with schema extensions;

alter table public.meeting_slots add column if not exists version integer not null default 1;
alter table public.meeting_slots add column if not exists operation_id uuid;
alter table public.meetings add column if not exists version integer not null default 1;
alter table public.meetings add column if not exists slot_id uuid references public.meeting_slots(id) on delete restrict;
alter table public.meetings add column if not exists room_state text not null default 'pending'
  check (room_state in ('pending','ready','compensation_pending','cancelled'));
alter table public.meetings add column if not exists cancelled_at timestamptz;

alter table public.meeting_slots drop constraint if exists meeting_slots_no_creator_overlap;
alter table public.meeting_slots add constraint meeting_slots_no_creator_overlap
  exclude using gist (
    tenant_id with =,
    created_by with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'open');

create table public.p311_operation_receipts (
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  operation_type text not null check (operation_type ~ '^meeting\.[a-z_]+$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  primary key (actor_id, operation_id)
);

create table public.meeting_participants (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  company_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  participant_role text not null check (participant_role in ('host','customer','employee','observer')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (meeting_id, profile_id),
  foreign key (tenant_id, company_id) references public.company_profiles(tenant_id,id) on delete restrict,
  check (ends_at > starts_at),
  exclude using gist (profile_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    where (active)
);

create table public.meeting_consents (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  participant_profile_id uuid not null references public.profiles(id) on delete restrict,
  purpose text not null check (purpose in ('recording','transcription','ai_summary')),
  policy_version text not null check (length(btrim(policy_version)) between 1 and 80),
  granted boolean not null,
  captured_at timestamptz not null default now(),
  source text not null check (source in ('prejoin','meeting','operator')),
  withdrawn_at timestamptz,
  primary key (meeting_id, participant_profile_id, purpose, captured_at),
  check (withdrawn_at is null or withdrawn_at >= captured_at)
);

create table public.meeting_recording_versions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  company_id uuid not null,
  provider_recording_id_hash text not null check (provider_recording_id_hash ~ '^[a-f0-9]{64}$'),
  storage_path text not null,
  mime_type text not null check (mime_type = 'video/mp4'),
  size_bytes bigint not null check (size_bytes between 12 and 524288000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  scan_provider text not null,
  scan_completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, company_id) references public.company_profiles(tenant_id,id) on delete restrict,
  unique (meeting_id, provider_recording_id_hash),
  unique (storage_path),
  unique (meeting_id, sha256)
);

create table public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 10000),
  visibility text not null check (visibility in ('internal','participants')),
  created_at timestamptz not null default now()
);

create table public.meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  proposed_by_summary_id uuid references public.meeting_ai_summaries(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 180),
  state text not null default 'proposed' check (state in ('proposed','accepted','completed','dismissed')),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((state = 'proposed' and accepted_at is null) or state <> 'proposed')
);

create table public.calendar_provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft','caldav')),
  state text not null default 'disconnected' check (state in ('connected','disconnected','revoked','error')),
  scopes text[] not null default '{}',
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  disconnected_at timestamptz,
  unique (owner_profile_id, provider)
);

create table public.meeting_provider_callback_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  destination_id uuid,
  provider_event_id_hash text not null check (provider_event_id_hash ~ '^[a-f0-9]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  state text not null default 'reserved' check (state in ('reserved','applied','ignored','failed')),
  unique (provider, destination_id, provider_event_id_hash)
);

alter table public.p311_operation_receipts enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_consents enable row level security;
alter table public.meeting_recording_versions enable row level security;
alter table public.meeting_notes enable row level security;
alter table public.meeting_action_items enable row level security;
alter table public.calendar_provider_connections enable row level security;
alter table public.meeting_provider_callback_receipts enable row level security;

revoke all on public.p311_operation_receipts, public.meeting_consents,
  public.meeting_recording_versions, public.calendar_provider_connections,
  public.meeting_provider_callback_receipts from anon, authenticated;
grant select on public.meeting_participants, public.meeting_notes, public.meeting_action_items to authenticated;

create or replace function private.p311_actor_role(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid, p_allowed text[]
) returns text language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select role::text into v_role from public.profiles
    where id=p_actor_id and status::text='active' for share;
  if v_role is null or not (v_role = any(p_allowed)) then
    raise exception using errcode='42501', message='FORBIDDEN';
  end if;
  if not exists (select 1 from public.company_profiles where id=p_company_id and tenant_id=p_tenant_id) then
    raise exception using errcode='42501', message='FORBIDDEN';
  end if;
  if v_role='pro' and not exists (
    select 1 from public.pro_company_assignments where pro_profile_id=p_actor_id
      and tenant_id=p_tenant_id and company_id=p_company_id and status::text='active'
  ) then raise exception using errcode='42501', message='FORBIDDEN';
  elsif v_role='customer' and not exists (
    select 1 from public.customer_profiles where profile_id=p_actor_id and linked_company_id=p_company_id
  ) then raise exception using errcode='42501', message='FORBIDDEN';
  elsif v_role='employee' and not exists (
    select 1 from public.employees where profile_id=p_actor_id and tenant_id=p_tenant_id
      and company_id=p_company_id and status::text='active'
  ) then raise exception using errcode='42501', message='FORBIDDEN';
  end if;
  return v_role;
end $$;

create or replace function private.p311_receipt(
  p_actor_id uuid, p_operation_id uuid, p_operation_type text, p_payload_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.p311_operation_receipts%rowtype;
begin
  select * into r from public.p311_operation_receipts
    where actor_id=p_actor_id and operation_id=p_operation_id for update;
  if not found then return null; end if;
  if r.operation_type<>p_operation_type or r.payload_hash<>p_payload_hash then
    raise exception using errcode='23505', message='OPERATION_CONFLICT';
  end if;
  return r.response;
end $$;

create or replace function private.p311_publish(
  p_type text, p_tenant uuid, p_company uuid, p_actor uuid,
  p_operation uuid, p_resource uuid, p_version integer, p_state text
) returns uuid language sql security definer set search_path = '' as $$
  select public.publish_domain_event(
    gen_random_uuid(), p_type, 1::smallint, now(), p_tenant, p_company, p_actor,
    p_operation, null, 'confidential',
    jsonb_build_object('resource_id',p_resource,'operation_id',p_operation,'version',p_version,'state',p_state),
    encode(extensions.digest(p_type||':'||p_operation::text,'sha256'),'hex')
  )
$$;

create or replace function public.p311_book_meeting(
  p_actor_id uuid, p_operation_id uuid, p_payload_hash text,
  p_tenant_id uuid, p_company_id uuid, p_slot_id uuid, p_expected_version integer,
  p_title text default 'Consultation'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.meeting_slots%rowtype; m public.meetings%rowtype; replay jsonb; response jsonb;
begin
  replay:=private.p311_receipt(p_actor_id,p_operation_id,'meeting.book',p_payload_hash);
  if replay is not null then return replay; end if;
  perform private.p311_actor_role(p_actor_id,p_tenant_id,p_company_id,array['pro','customer']);
  select * into s from public.meeting_slots where id=p_slot_id and tenant_id=p_tenant_id for update;
  if not found then raise exception using errcode='P0002', message='MEETING_NOT_FOUND'; end if;
  if s.status::text<>'open' or s.version<>p_expected_version then
    raise exception using errcode='40001', message='MEETING_CONFLICT';
  end if;
  insert into public.meetings(tenant_id,company_id,customer_profile_id,created_by,title,status,
    scheduled_at,duration_minutes,timezone,provider,slot_id,version,room_state)
  values(p_tenant_id,p_company_id,
    case when (select role::text from public.profiles where id=p_actor_id)='customer' then p_actor_id end,
    p_actor_id,btrim(p_title),'scheduled',s.starts_at,
    greatest(15,extract(epoch from (s.ends_at-s.starts_at))/60)::integer,'Asia/Dubai','daily',s.id,1,'pending')
  returning * into m;
  update public.meeting_slots set status='booked',version=version+1,operation_id=p_operation_id where id=s.id;
  insert into public.meeting_participants(meeting_id,tenant_id,company_id,profile_id,participant_role,starts_at,ends_at)
    values(m.id,p_tenant_id,p_company_id,p_actor_id,
      case when m.customer_profile_id=p_actor_id then 'customer' else 'host' end,s.starts_at,s.ends_at);
  perform private.p311_publish('meeting.booked',p_tenant_id,p_company_id,p_actor_id,p_operation_id,m.id,1,'scheduled');
  response:=jsonb_build_object('meeting_id',m.id,'version',1,'room_state','pending');
  insert into public.p311_operation_receipts values(p_actor_id,p_operation_id,'meeting.book',p_payload_hash,response,now());
  return response;
end $$;

create or replace function public.p311_reschedule_meeting(
  p_actor_id uuid, p_operation_id uuid, p_payload_hash text,
  p_meeting_id uuid, p_expected_version integer, p_starts_at timestamptz, p_ends_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.meetings%rowtype; replay jsonb; response jsonb;
begin
  replay:=private.p311_receipt(p_actor_id,p_operation_id,'meeting.reschedule',p_payload_hash);
  if replay is not null then return replay; end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  if not found then raise exception using errcode='P0002', message='MEETING_NOT_FOUND'; end if;
  perform private.p311_actor_role(p_actor_id,m.tenant_id,m.company_id,array['pro','customer','admin','super_admin']);
  if m.version<>p_expected_version or m.status::text<>'scheduled' or p_ends_at<=p_starts_at then
    raise exception using errcode='40001', message='MEETING_CONFLICT';
  end if;
  update public.meetings set scheduled_at=p_starts_at,
    duration_minutes=(extract(epoch from (p_ends_at-p_starts_at))/60)::integer,
    version=version+1,room_state='compensation_pending' where id=m.id returning * into m;
  update public.meeting_participants set starts_at=p_starts_at,ends_at=p_ends_at where meeting_id=m.id;
  perform private.p311_publish('meeting.rescheduled',m.tenant_id,m.company_id,p_actor_id,p_operation_id,m.id,m.version,'scheduled');
  response:=jsonb_build_object('meeting_id',m.id,'version',m.version,'room_state',m.room_state);
  insert into public.p311_operation_receipts values(p_actor_id,p_operation_id,'meeting.reschedule',p_payload_hash,response,now());
  return response;
end $$;

create or replace function public.p311_cancel_meeting(
  p_actor_id uuid, p_operation_id uuid, p_payload_hash text,
  p_meeting_id uuid, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.meetings%rowtype; replay jsonb; response jsonb;
begin
  replay:=private.p311_receipt(p_actor_id,p_operation_id,'meeting.cancel',p_payload_hash);
  if replay is not null then return replay; end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  if not found then raise exception using errcode='P0002', message='MEETING_NOT_FOUND'; end if;
  perform private.p311_actor_role(p_actor_id,m.tenant_id,m.company_id,array['pro','customer','admin','super_admin']);
  if m.version<>p_expected_version or m.status::text<>'scheduled' then
    raise exception using errcode='40001', message='MEETING_CONFLICT';
  end if;
  update public.meetings set status='cancelled',cancelled_at=now(),version=version+1,
    room_state='compensation_pending' where id=m.id returning * into m;
  update public.meeting_participants set active=false where meeting_id=m.id;
  perform private.p311_publish('meeting.cancelled',m.tenant_id,m.company_id,p_actor_id,p_operation_id,m.id,m.version,'cancelled');
  response:=jsonb_build_object('meeting_id',m.id,'version',m.version,'room_state',m.room_state);
  insert into public.p311_operation_receipts values(p_actor_id,p_operation_id,'meeting.cancel',p_payload_hash,response,now());
  return response;
end $$;

insert into public.event_contract_registrations(event_type,event_version,payload_schema) values
 ('meeting.booked',1,'{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}'),
 ('meeting.rescheduled',1,'{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}'),
 ('meeting.cancelled',1,'{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}'),
 ('meeting.recording.ready',1,'{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}'),
 ('meeting.ai.requested',1,'{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}')
on conflict (event_type,event_version) do nothing;

insert into public.event_consumer_registrations(consumer_name,event_type,event_version,max_attempts,default_lease_seconds,enabled) values
 ('internal.meeting.invitation','meeting.booked',1,5,120,true),
 ('internal.meeting.invitation','meeting.rescheduled',1,5,120,true),
 ('internal.meeting.invitation','meeting.cancelled',1,5,120,true),
 ('p311.meeting_ai.processor','meeting.ai.requested',1,5,300,true)
on conflict (consumer_name,event_type,event_version) do nothing;

revoke all on function public.p311_book_meeting(uuid,uuid,text,uuid,uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.p311_reschedule_meeting(uuid,uuid,text,uuid,integer,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.p311_cancel_meeting(uuid,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.p311_book_meeting(uuid,uuid,text,uuid,uuid,uuid,integer,text) to service_role;
grant execute on function public.p311_reschedule_meeting(uuid,uuid,text,uuid,integer,timestamptz,timestamptz) to service_role;
grant execute on function public.p311_cancel_meeting(uuid,uuid,text,uuid,integer) to service_role;

commit;
