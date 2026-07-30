-- 0027_invoices_payments_refunds_tap_config.sql
-- Step 21 — Tap Payments + Invoices Ledger.
--
-- Adds:
--   * invoices                 — billable items (open/paid/void/refunded)
--   * payments                 — charge attempts (Tap or manual)
--   * refunds                  — Tap refunds keyed to a payment
--   * tenant_payment_config    — per-tenant Tap merchant + secrets
--                                (composite PK so Step 22 can add provider='stripe')
--
-- Audit-CHECK extension:
--   tenant_audit_log.action gains:
--     invoice_created, invoice_voided, invoice_marked_paid,
--     payment_initiated, payment_succeeded, payment_failed, refund_issued
--
-- Source: docs/step-21-prompt.md, docs/step-21-tap-payments-plan.md.

-- ============================================================
-- audit log: extend action CHECK
-- ============================================================
alter table public.tenant_audit_log drop constraint if exists tenant_audit_log_action_check;
alter table public.tenant_audit_log add constraint tenant_audit_log_action_check
  check (action in (
    'created','approved','rejected','suspended','reactivated','updated','completed','cancelled',
    'unlocked','session_revoked',
    'invoice_created','invoice_voided','invoice_marked_paid',
    'payment_initiated','payment_succeeded','payment_failed','refund_issued'
  ));

-- ============================================================
-- tenant_payment_config (service-role only — matches tenant_smtp_config)
-- ============================================================
create table if not exists public.tenant_payment_config (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('tap','stripe')),
  merchant_id text not null,
  secret_encrypted text not null,
  webhook_secret_encrypted text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, provider)
);
alter table public.tenant_payment_config enable row level security;
drop trigger if exists tenant_payment_config_set_updated_at on public.tenant_payment_config;
create trigger tenant_payment_config_set_updated_at before update on public.tenant_payment_config
  for each row execute function public.set_updated_at();

-- ============================================================
-- invoices
--   status CHECK list — locked
--     'draft' | 'open' | 'paid' | 'void' | 'refunded' | 'partially_refunded'
--   linked_entity_type CHECK list — locked
--     'renewal' | 'document_request' | 'manual'
-- ============================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  customer_profile_id uuid references public.customer_profiles(profile_id) on delete set null,
  linked_entity_type text check (linked_entity_type in ('renewal','document_request','manual')),
  linked_entity_id text,
  label text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'AED' check (char_length(currency) = 3),
  status text not null default 'open' check (status in (
    'draft','open','paid','void','refunded','partially_refunded'
  )),
  due_at date,
  paid_at timestamptz,
  void_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.invoices enable row level security;

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create index if not exists invoices_tenant_status_created_idx
  on public.invoices (tenant_id, status, created_at desc);
create index if not exists invoices_client_status_idx
  on public.invoices (client_id, status);
create index if not exists invoices_customer_open_idx
  on public.invoices (customer_profile_id)
  where status = 'open';
create index if not exists invoices_linked_entity_idx
  on public.invoices (linked_entity_type, linked_entity_id);

-- RLS — invoices
--   super_admin reads all.
--   pro/admin (tenant role) read+write own tenant.
--   customer reads only invoices linked to their own customer_profile.
drop policy if exists invoices_super_admin_read on public.invoices;
create policy invoices_super_admin_read on public.invoices for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop policy if exists invoices_pro_rw on public.invoices;
create policy invoices_pro_rw on public.invoices for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

drop policy if exists invoices_customer_read on public.invoices;
create policy invoices_customer_read on public.invoices for select
  using (
    customer_profile_id = auth.uid()
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'customer'
  );

-- ============================================================
-- payments
--   provider CHECK — 'tap' | 'manual'
--   status CHECK   — 'initiated' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded'
--   method CHECK   — 'mada' | 'apple_pay' | 'card' | 'cash' | 'bank_transfer' | null
-- ============================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  provider text not null check (provider in ('tap','manual')),
  provider_charge_id text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'AED' check (char_length(currency) = 3),
  method text check (method in ('mada','apple_pay','card','cash','bank_transfer')),
  status text not null default 'initiated' check (status in (
    'initiated','succeeded','failed','refunded','partially_refunded'
  )),
  failure_reason text,
  received_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;

create index if not exists payments_invoice_created_idx
  on public.payments (invoice_id, created_at desc);
create unique index if not exists payments_provider_charge_uniq
  on public.payments (provider_charge_id)
  where provider_charge_id is not null;

drop policy if exists payments_super_admin_read on public.payments;
create policy payments_super_admin_read on public.payments for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop policy if exists payments_pro_rw on public.payments;
create policy payments_pro_rw on public.payments for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

drop policy if exists payments_customer_read on public.payments;
create policy payments_customer_read on public.payments for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'customer'
    and exists (
      select 1 from public.invoices i
      where i.id = payments.invoice_id
        and i.customer_profile_id = auth.uid()
    )
  );

-- ============================================================
-- refunds
--   status CHECK — 'pending' | 'succeeded' | 'failed'
-- ============================================================
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  provider_refund_id text,
  amount_minor bigint not null check (amount_minor >= 0),
  reason text,
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  created_at timestamptz not null default now()
);
alter table public.refunds enable row level security;

create index if not exists refunds_payment_created_idx
  on public.refunds (payment_id, created_at desc);
create unique index if not exists refunds_provider_refund_uniq
  on public.refunds (provider_refund_id)
  where provider_refund_id is not null;

drop policy if exists refunds_super_admin_read on public.refunds;
create policy refunds_super_admin_read on public.refunds for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop policy if exists refunds_pro_rw on public.refunds;
create policy refunds_pro_rw on public.refunds for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

drop policy if exists refunds_customer_read on public.refunds;
create policy refunds_customer_read on public.refunds for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'customer'
    and exists (
      select 1 from public.payments p
      join public.invoices i on i.id = p.invoice_id
      where p.id = refunds.payment_id
        and i.customer_profile_id = auth.uid()
    )
  );
