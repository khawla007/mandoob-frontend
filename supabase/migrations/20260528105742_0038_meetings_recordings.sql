-- Step 27 — Meetings + recordings.

do $$
begin
  create type public.meeting_status as enum (
    'scheduled',
    'completed',
    'cancelled',
    'no_show',
    'recording_ready'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.meeting_slot_status as enum (
    'open',
    'booked',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.meeting_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Dubai',
  status public.meeting_slot_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_slots_time_check check (ends_at > starts_at)
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  customer_profile_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  status public.meeting_status not null default 'scheduled',
  scheduled_at timestamptz not null,
  duration_minutes int not null default 30 check (duration_minutes > 0 and duration_minutes <= 480),
  timezone text not null default 'Asia/Dubai',
  provider text not null default 'daily',
  provider_event_id text,
  provider_room_name text,
  meeting_url text,
  recording_storage_path text,
  recording_url text,
  recording_ready_at timestamptz,
  consent_notice_shown_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists meeting_slots_set_updated_at on public.meeting_slots;
create trigger meeting_slots_set_updated_at before update on public.meeting_slots
  for each row execute function public.set_updated_at();

drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

create index if not exists meeting_slots_tenant_starts_idx
  on public.meeting_slots(tenant_id, starts_at);
create index if not exists meeting_slots_tenant_open_idx
  on public.meeting_slots(tenant_id, starts_at)
  where status = 'open';
create index if not exists meetings_tenant_scheduled_idx
  on public.meetings(tenant_id, scheduled_at desc);
create index if not exists meetings_lead_scheduled_idx
  on public.meetings(lead_id, scheduled_at desc)
  where lead_id is not null;
create index if not exists meetings_client_scheduled_idx
  on public.meetings(client_id, scheduled_at desc)
  where client_id is not null;
create index if not exists meetings_customer_scheduled_idx
  on public.meetings(customer_profile_id, scheduled_at desc)
  where customer_profile_id is not null;
create index if not exists meetings_provider_room_idx
  on public.meetings(provider_room_name)
  where provider_room_name is not null;

alter table public.meeting_slots enable row level security;
alter table public.meetings enable row level security;

drop policy if exists meeting_slots_platform_read on public.meeting_slots;
create policy meeting_slots_platform_read on public.meeting_slots for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin','admin'));

drop policy if exists meeting_slots_tenant_read on public.meeting_slots;
create policy meeting_slots_tenant_read on public.meeting_slots for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid);

drop policy if exists meeting_slots_pro_write on public.meeting_slots;
create policy meeting_slots_pro_write on public.meeting_slots for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

drop policy if exists meetings_platform_read on public.meetings;
create policy meetings_platform_read on public.meetings for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin','admin'));

drop policy if exists meetings_pro_tenant_rw on public.meetings;
create policy meetings_pro_tenant_rw on public.meetings for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

drop policy if exists meetings_customer_read on public.meetings;
create policy meetings_customer_read on public.meetings for select
  using (
    customer_profile_id = auth.uid()
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'customer'
  );

insert into storage.buckets (id, name, public)
  values ('tenant-meetings', 'tenant-meetings', false)
  on conflict (id) do nothing;

drop policy if exists tenant_meetings_platform_read on storage.objects;
create policy tenant_meetings_platform_read on storage.objects for select
  using (
    bucket_id = 'tenant-meetings'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin','admin')
  );

drop policy if exists tenant_meetings_tenant_read on storage.objects;
create policy tenant_meetings_tenant_read on storage.objects for select
  using (
    bucket_id = 'tenant-meetings'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','customer')
  );

drop policy if exists tenant_meetings_system_write on storage.objects;
create policy tenant_meetings_system_write on storage.objects for insert
  with check (
    bucket_id = 'tenant-meetings'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

alter table public.tenant_audit_log
  drop constraint if exists tenant_audit_log_action_check;

alter table public.tenant_audit_log
  add constraint tenant_audit_log_action_check
  check (action in (
    'created',
    'approved',
    'rejected',
    'suspended',
    'reactivated',
    'updated',
    'completed',
    'cancelled',
    'unlocked',
    'session_revoked',
    'invoice_created',
    'invoice_voided',
    'invoice_marked_paid',
    'payment_initiated',
    'payment_succeeded',
    'payment_failed',
    'refund_issued',
    'infected_blocked',
    'reconciled',
    'comms_skipped_opted_out',
    'lead_created',
    'lead_assigned',
    'lead_stage_changed',
    'lead_note_added',
    'erasure_requested',
    'erasure_verified',
    'erasure_approved',
    'erasure_rejected',
    'erasure_completed',
    'bulk_imported',
    'meeting_slot_created',
    'meeting_scheduled',
    'meeting_cancelled',
    'meeting_completed',
    'meeting_recording_attached'
  ));
