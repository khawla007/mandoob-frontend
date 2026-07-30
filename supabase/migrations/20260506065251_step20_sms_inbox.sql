create table if not exists public.sms_inbox (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_phone text not null,
  body text,
  provider_message_id text not null unique,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sms_inbox_tenant_received_idx
  on public.sms_inbox (tenant_id, received_at desc);
create index if not exists sms_inbox_from_phone_idx
  on public.sms_inbox (from_phone);

alter table public.sms_inbox enable row level security;

create policy sms_inbox_super_admin_read on public.sms_inbox
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = any (array['super_admin'::app_role, 'admin'::app_role])
    )
  );

create policy sms_inbox_tenant_read on public.sms_inbox
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = sms_inbox.tenant_id
        and p.role = any (array['pro'::app_role, 'admin'::app_role])
    )
  );