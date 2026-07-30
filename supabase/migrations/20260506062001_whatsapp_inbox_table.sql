-- Step 19.5: lightweight inbound WhatsApp message log.
-- Reply-handling logic deferred to Step 20 (unified comms thread).

create table if not exists public.whatsapp_inbox (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_phone text not null,
  body text,
  wamid text unique,
  received_at timestamptz not null default now()
);

create index if not exists whatsapp_inbox_tenant_received_idx
  on public.whatsapp_inbox (tenant_id, received_at desc);

alter table public.whatsapp_inbox enable row level security;

create policy whatsapp_inbox_super_admin_read on public.whatsapp_inbox
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin','admin')
    )
  );

create policy whatsapp_inbox_tenant_read on public.whatsapp_inbox
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = whatsapp_inbox.tenant_id
        and p.role in ('pro','admin')
    )
  );
