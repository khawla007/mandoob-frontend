-- Step 27b: tenant-scoped AI transcript summaries for recorded meetings.

create table if not exists public.meeting_ai_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  transcript_text text,
  summary_text text,
  decisions jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  risks_or_followups jsonb not null default '[]'::jsonb,
  language text,
  provider text,
  model text,
  error text,
  error_code text check (
    error_code is null
    or error_code in (
      'PROVIDER_NOT_CONFIGURED',
      'RECORDING_NOT_FOUND',
      'RECORDING_TOO_LARGE',
      'TRANSCRIPTION_FAILED',
      'SUMMARY_FAILED',
      'INVALID_PROVIDER_OUTPUT',
      'INTERNAL'
    )
  ),
  attempts integer not null default 0 check (attempts >= 0),
  customer_visible boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_ai_summaries_one_per_meeting unique (meeting_id),
  constraint meeting_ai_summaries_tenant_meeting_unique unique (tenant_id, meeting_id),
  constraint meeting_ai_summaries_json_arrays check (
    jsonb_typeof(decisions) = 'array'
    and jsonb_typeof(action_items) = 'array'
    and jsonb_typeof(risks_or_followups) = 'array'
  )
);

drop trigger if exists meeting_ai_summaries_set_updated_at on public.meeting_ai_summaries;
create trigger meeting_ai_summaries_set_updated_at before update on public.meeting_ai_summaries
  for each row execute function public.set_updated_at();

create index if not exists meeting_ai_summaries_tenant_status_idx
  on public.meeting_ai_summaries(tenant_id, status, created_at);
create index if not exists meeting_ai_summaries_pending_idx
  on public.meeting_ai_summaries(created_at)
  where status = 'pending';

alter table public.meeting_ai_summaries enable row level security;

drop policy if exists meeting_ai_summaries_platform_read on public.meeting_ai_summaries;
create policy meeting_ai_summaries_platform_read on public.meeting_ai_summaries for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists meeting_ai_summaries_pro_read on public.meeting_ai_summaries;
create policy meeting_ai_summaries_pro_read on public.meeting_ai_summaries for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'pro'
    and tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
  );

drop policy if exists meeting_ai_summaries_customer_read on public.meeting_ai_summaries;
create policy meeting_ai_summaries_customer_read on public.meeting_ai_summaries for select
  using (
    customer_visible = true
    and exists (
      select 1
      from public.meetings m
      where m.id = meeting_ai_summaries.meeting_id
        and m.customer_profile_id = auth.uid()
    )
  );

drop policy if exists meeting_ai_summaries_service_write on public.meeting_ai_summaries;
create policy meeting_ai_summaries_service_write on public.meeting_ai_summaries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
