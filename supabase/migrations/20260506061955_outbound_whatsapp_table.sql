-- Step 19.1: outbound WhatsApp queue table mirroring outbound_emails.
-- WhatsApp is always tenant-scoped (no platform-level WA), so tenant_id is NOT NULL.

create table if not exists public.outbound_whatsapp (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id text not null,
  meta_template_name text not null,
  meta_template_lang text not null default 'en',
  to_phone text not null,
  components jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','sent','delivered','read','failed','dead')),
  attempts int not null default 0,
  last_error text,
  provider_message_id text,
  linked_entity_type text,
  linked_entity_id text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists outbound_whatsapp_pending_due_idx
  on public.outbound_whatsapp (status, scheduled_for)
  where status = 'pending';

create index if not exists outbound_whatsapp_tenant_created_idx
  on public.outbound_whatsapp (tenant_id, created_at desc);

create index if not exists outbound_whatsapp_linked_idx
  on public.outbound_whatsapp (linked_entity_type, linked_entity_id);

create index if not exists outbound_whatsapp_provider_idx
  on public.outbound_whatsapp (provider_message_id);

create unique index if not exists outbound_whatsapp_idem_idx
  on public.outbound_whatsapp (linked_entity_type, linked_entity_id, scheduled_for)
  where linked_entity_type is not null;

alter table public.outbound_whatsapp enable row level security;

create policy outbound_whatsapp_super_admin_read on public.outbound_whatsapp
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin','admin')
    )
  );

create policy outbound_whatsapp_tenant_read on public.outbound_whatsapp
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = outbound_whatsapp.tenant_id
        and p.role in ('pro','admin')
    )
  );
