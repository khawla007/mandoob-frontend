create table if not exists public.outbound_sms (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id text not null,
  to_phone text not null,
  body text not null,
  provider text not null check (provider in ('unifonic','twilio')),
  sender_id text not null,
  status text not null check (status in ('pending','sent','delivered','failed','dead')),
  attempts int not null default 0,
  last_error text,
  provider_message_id text,
  linked_entity_type text,
  linked_entity_id text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists outbound_sms_pending_due_idx
  on public.outbound_sms (status, scheduled_for) where status = 'pending';
create index if not exists outbound_sms_tenant_created_idx
  on public.outbound_sms (tenant_id, created_at desc);
create index if not exists outbound_sms_linked_idx
  on public.outbound_sms (linked_entity_type, linked_entity_id);
create index if not exists outbound_sms_provider_idx
  on public.outbound_sms (provider_message_id);
create unique index if not exists outbound_sms_idem_idx
  on public.outbound_sms (linked_entity_type, linked_entity_id, scheduled_for)
  where linked_entity_type is not null;

alter table public.outbound_sms enable row level security;

create policy outbound_sms_super_admin_read on public.outbound_sms
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = any (array['super_admin'::app_role, 'admin'::app_role])
    )
  );

create policy outbound_sms_tenant_read on public.outbound_sms
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = outbound_sms.tenant_id
        and p.role = any (array['pro'::app_role, 'admin'::app_role])
    )
  );