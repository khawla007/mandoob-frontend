-- Step 26b — Inbound replies in Lead Kanban activity.

alter table public.lead_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.lead_events
  drop constraint if exists lead_events_event_type_check;

alter table public.lead_events
  add constraint lead_events_event_type_check
  check (event_type in (
    'lead_assigned',
    'lead_stage_changed',
    'lead_note_added',
    'inbound_reply'
  ));

create unique index if not exists lead_events_inbound_provider_message_uniq
  on public.lead_events(
    tenant_id,
    (metadata ->> 'channel'),
    (metadata ->> 'provider_message_id')
  )
  where event_type = 'inbound_reply'
    and metadata ->> 'provider_message_id' is not null;

create unique index if not exists lead_events_inbound_inbox_uniq
  on public.lead_events(
    tenant_id,
    (metadata ->> 'channel'),
    (metadata ->> 'inbox_id')
  )
  where event_type = 'inbound_reply'
    and metadata ->> 'inbox_id' is not null;
