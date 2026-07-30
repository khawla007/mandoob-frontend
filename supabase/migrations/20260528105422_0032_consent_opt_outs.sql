-- Step 19a — STOP / START keyword opt-out enforcement for WhatsApp and SMS.

create table if not exists public.consent_opt_outs (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  channel text not null check (channel in ('whatsapp', 'sms')),
  opted_out_at timestamptz not null default now(),
  opted_in_at timestamptz,
  source text not null default 'inbound_keyword'
    check (source in ('inbound_keyword', 'admin_action', 'provider_callback')),
  last_inbound_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consent_opt_outs enable row level security;

create unique index if not exists consent_opt_outs_phone_channel_active
  on public.consent_opt_outs (phone_e164, channel)
  where opted_in_at is null;

create index if not exists consent_opt_outs_phone_channel_idx
  on public.consent_opt_outs (phone_e164, channel, opted_in_at);

drop trigger if exists consent_opt_outs_set_updated_at on public.consent_opt_outs;
create trigger consent_opt_outs_set_updated_at before update on public.consent_opt_outs
  for each row execute function public.set_updated_at();

drop policy if exists consent_opt_outs_admin_all on public.consent_opt_outs;
create policy consent_opt_outs_admin_all on public.consent_opt_outs for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists consent_opt_outs_pro_customer_phone_read on public.consent_opt_outs;
create policy consent_opt_outs_pro_customer_phone_read on public.consent_opt_outs for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'pro'
    and exists (
      select 1
      from public.customer_profiles cp
      join public.profiles p on p.id = cp.profile_id
      where p.phone = consent_opt_outs.phone_e164
        and p.tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    )
  );

drop policy if exists consent_opt_outs_customer_self_read on public.consent_opt_outs;
create policy consent_opt_outs_customer_self_read on public.consent_opt_outs for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.phone = consent_opt_outs.phone_e164
    )
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
    'comms_skipped_opted_out'
  ));
