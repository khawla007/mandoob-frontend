-- 0020_renewals_foundation.sql
-- Step 15 — Renewals & Compliance Tracker foundation (PRD Module 11).
--
-- Adds:
--   * renewals                       — one row per tracked renewal
--                                      (license auto-row + manual visa/eid/ejari)
--   * compute_notify_at(date)        — precomputes 30/7/1d reminder timestamps
--                                      at 08:00 Asia/Dubai (UTC array)
--   * renewals_sync_from_license()   — clients.license_expiry trigger:
--                                      upsert/cancel the auto-row, write audit row
--   * recompute_renewal_status()     — nightly status update (upcoming/due_soon/overdue)
--   * pg_cron schedule               — '0 2 * * *' UTC nightly recompute
--
-- Audit-CHECK extension:
--   * tenant_audit_log.action gains 'completed' and 'cancelled' for renewal lifecycle.
--     Additive, low risk; existing callers unaffected.
--
-- Side effects:
--   * `create extension if not exists pg_cron` creates the `cron` schema. Idempotent.
--
-- Source: docs/step-15-prompt.md, docs/step-15-renewals-foundation-plan.md.

-- ============================================================
-- audit log: extend action CHECK to allow renewal lifecycle
-- ============================================================
alter table public.tenant_audit_log drop constraint if exists tenant_audit_log_action_check;
alter table public.tenant_audit_log add constraint tenant_audit_log_action_check
  check (action in (
    'created','approved','rejected','suspended','reactivated','updated','completed','cancelled'
  ));

-- ============================================================
-- helper: compute_notify_at — 30/7/1d before due, 08:00 Asia/Dubai
-- Returns only future timestamps so the dispatcher (Step 18) can
-- iterate without filtering past entries.
-- ============================================================
create or replace function public.compute_notify_at(due date)
returns timestamptz[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(t order by t), '{}'::timestamptz[])
  from unnest(array[
    ((due - 30)::text || ' 08:00 Asia/Dubai')::timestamptz,
    ((due - 7)::text  || ' 08:00 Asia/Dubai')::timestamptz,
    ((due - 1)::text  || ' 08:00 Asia/Dubai')::timestamptz
  ]) as t
  where t > now();
$$;

-- ============================================================
-- renewals
--   type CHECK list — locked by the kickoff prompt §1
--     'license' | 'visa' | 'eid' | 'ejari'
--   status CHECK list — locked
--     'upcoming' | 'due_soon' | 'overdue' | 'completed' | 'cancelled'
--   source CHECK list — locked
--     'license_backfill' | 'manual'
-- ============================================================
create table if not exists public.renewals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null check (type in ('license','visa','eid','ejari')),
  label text not null,
  due_date date not null,
  status text not null default 'upcoming' check (status in (
    'upcoming','due_soon','overdue','completed','cancelled'
  )),
  notify_at timestamptz[] not null default '{}',
  last_notified_at timestamptz,
  source text not null check (source in ('license_backfill','manual')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.renewals enable row level security;

drop trigger if exists renewals_set_updated_at on public.renewals;
create trigger renewals_set_updated_at before update on public.renewals
  for each row execute function public.set_updated_at();

-- One auto row per (tenant, client, type='license') from the trigger.
-- Manual rows have no uniqueness constraint — PROs may add multiple visas etc.
create unique index if not exists renewals_license_backfill_uniq
  on public.renewals (tenant_id, client_id, type)
  where source = 'license_backfill';

create index if not exists renewals_tenant_due_idx
  on public.renewals (tenant_id, due_date);
create index if not exists renewals_tenant_status_idx
  on public.renewals (tenant_id, status);
create index if not exists renewals_tenant_active_idx
  on public.renewals (tenant_id)
  where status in ('upcoming','due_soon','overdue');

-- ============================================================
-- RLS — renewals (mirrors documents shape from 0019)
-- ============================================================
drop policy if exists renewals_super_admin_read on public.renewals;
create policy renewals_super_admin_read on public.renewals for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

drop policy if exists renewals_tenant_read on public.renewals;
create policy renewals_tenant_read on public.renewals for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid);

drop policy if exists renewals_pro_write on public.renewals;
create policy renewals_pro_write on public.renewals for all
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('pro','admin')
  );

-- ============================================================
-- trigger: clients.license_expiry → renewals (license auto-row)
--
-- Insert/update of license_expiry: upsert the matching auto-row.
-- Setting license_expiry → null: cancel the existing auto-row
--                                (preserve audit trail; do not delete).
--
-- Writes a tenant_audit_log row on every transition with
-- action ∈ created|updated|cancelled, source='system',
-- details.entity='renewal', details.op='license_backfill'.
-- ============================================================
create or replace function public.renewals_sync_from_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id uuid;
  v_action text;
  v_was_insert boolean;
begin
  if NEW.license_expiry is not null then
    insert into public.renewals (
      tenant_id, client_id, type, label, due_date, notify_at, source, status
    )
    values (
      NEW.tenant_id, NEW.id, 'license',
      'Trade license — ' || coalesce(NEW.trade_license_no, NEW.company_name),
      NEW.license_expiry,
      public.compute_notify_at(NEW.license_expiry),
      'license_backfill',
      case
        when (NEW.license_expiry - current_date) < 0 then 'overdue'
        when (NEW.license_expiry - current_date) <= 30 then 'due_soon'
        else 'upcoming'
      end
    )
    on conflict (tenant_id, client_id, type)
      where source = 'license_backfill'
    do update set
      label      = excluded.label,
      due_date   = excluded.due_date,
      notify_at  = excluded.notify_at,
      status     = case
        when public.renewals.status in ('completed','cancelled') then public.renewals.status
        else excluded.status
      end,
      updated_at = now()
    returning id, (xmax = 0) into v_row_id, v_was_insert;

    -- xmax=0 → insert (no prior row); else → update.
    if v_was_insert then
      v_action := 'created';
    else
      v_action := 'updated';
    end if;

    insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
    values (
      NEW.tenant_id,
      null,
      v_action,
      'system',
      jsonb_build_object(
        'entity', 'renewal',
        'op', 'license_backfill',
        'renewal_id', v_row_id,
        'client_id', NEW.id,
        'license_expiry', NEW.license_expiry
      )
    );
  else
    update public.renewals
       set status = 'cancelled', updated_at = now()
     where tenant_id = NEW.tenant_id
       and client_id = NEW.id
       and type = 'license'
       and source = 'license_backfill'
       and status not in ('cancelled','completed')
     returning id into v_row_id;

    if v_row_id is not null then
      insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
      values (
        NEW.tenant_id,
        null,
        'cancelled',
        'system',
        jsonb_build_object(
          'entity', 'renewal',
          'op', 'license_backfill',
          'renewal_id', v_row_id,
          'client_id', NEW.id,
          'reason', 'license_expiry_cleared'
        )
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists clients_renewals_sync on public.clients;
create trigger clients_renewals_sync
  after insert or update of license_expiry on public.clients
  for each row execute function public.renewals_sync_from_license();

-- ============================================================
-- one-shot backfill — existing clients with license_expiry set
-- ============================================================
insert into public.renewals (
  tenant_id, client_id, type, label, due_date, notify_at, source, status
)
select
  c.tenant_id,
  c.id,
  'license',
  'Trade license — ' || coalesce(c.trade_license_no, c.company_name),
  c.license_expiry,
  public.compute_notify_at(c.license_expiry),
  'license_backfill',
  case
    when (c.license_expiry - current_date) < 0 then 'overdue'
    when (c.license_expiry - current_date) <= 30 then 'due_soon'
    else 'upcoming'
  end
from public.clients c
where c.license_expiry is not null
on conflict (tenant_id, client_id, type)
  where source = 'license_backfill'
do nothing;

-- ============================================================
-- nightly recompute — status only (notify_at is recomputed by
-- the trigger when due_date changes, so cron stays cheap).
-- ============================================================
create or replace function public.recompute_renewal_status()
returns void
language sql
security definer
set search_path = public
as $$
  update public.renewals set status = case
    when (due_date - current_date) < 0  then 'overdue'
    when (due_date - current_date) <= 30 then 'due_soon'
    else 'upcoming'
  end
  where status not in ('completed','cancelled')
    and status is distinct from case
      when (due_date - current_date) < 0  then 'overdue'
      when (due_date - current_date) <= 30 then 'due_soon'
      else 'upcoming'
    end;
$$;

create extension if not exists pg_cron;

-- Idempotent schedule: drop existing job by name, re-create.
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'renewals-recompute';
exception when others then null;
end $$;

select cron.schedule(
  'renewals-recompute',
  '0 2 * * *',
  $cron$select public.recompute_renewal_status()$cron$
);
