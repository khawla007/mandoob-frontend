-- 0029_stripe_subscriptions.sql
-- Step 22 — Stripe subscription billing for PRO firms.

alter table public.tenants drop constraint if exists tenants_plan_check;
alter table public.tenants add constraint tenants_plan_check
  check (plan in ('starter','professional','enterprise'));

alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('tap','manual','stripe'));

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  plan text not null check (plan in ('starter','professional','enterprise')),
  status text not null check (status in (
    'trialing','active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused'
  )),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  unit_amount_minor bigint not null,
  currency text not null default 'USD' check (char_length(currency) = 3),
  interval text not null check (interval in ('month','year')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create index if not exists subscriptions_tenant_idx on public.subscriptions (tenant_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_plan_status_idx on public.subscriptions (plan, status);

drop policy if exists subscriptions_platform_read on public.subscriptions;
create policy subscriptions_platform_read on public.subscriptions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin','admin'));

drop policy if exists subscriptions_pro_read_own on public.subscriptions;
create policy subscriptions_pro_read_own on public.subscriptions for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'pro'
  );
