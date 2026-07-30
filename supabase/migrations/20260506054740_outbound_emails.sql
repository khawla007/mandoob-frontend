create table public.outbound_emails (
  id bigserial primary key,
  tenant_id uuid null references public.tenants(id) on delete cascade,
  template_id text not null,
  to_address text not null,
  from_address text not null,
  reply_to text null,
  subject text not null,
  body_html text not null,
  body_text text null,
  status text not null check (status in ('pending','sent','failed','dead')),
  attempts int not null default 0,
  last_error text null,
  provider_id text null,
  linked_entity_type text null,
  linked_entity_id text null,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);

create index outbound_emails_status_scheduled_idx
  on public.outbound_emails (status, scheduled_for)
  where status = 'pending';

create index outbound_emails_tenant_created_idx
  on public.outbound_emails (tenant_id, created_at desc);

create index outbound_emails_linked_idx
  on public.outbound_emails (linked_entity_type, linked_entity_id);

create unique index outbound_emails_linked_scheduled_unique
  on public.outbound_emails (linked_entity_type, linked_entity_id, scheduled_for)
  where linked_entity_type is not null
    and linked_entity_id is not null;

alter table public.outbound_emails enable row level security;

create policy outbound_emails_super_admin_read on public.outbound_emails
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('super_admin','admin')
        and p.tenant_id is null
    )
  );

create policy outbound_emails_tenant_read on public.outbound_emails
  for select using (
    tenant_id is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = outbound_emails.tenant_id
        and p.role::text in ('pro','admin')
    )
  );