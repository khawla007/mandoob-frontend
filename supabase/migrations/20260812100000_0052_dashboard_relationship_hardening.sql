-- Enforce tenant ownership along invoice -> payment -> refund chains for new writes.
-- NOT VALID preserves legacy inconsistent rows without deleting data; operators may validate
-- each constraint after separately reconciling any historical violations.

create unique index if not exists invoices_tenant_id_id_key
  on public.invoices (tenant_id, id);
create unique index if not exists payments_tenant_id_id_key
  on public.payments (tenant_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_invoice_tenant_fk'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_invoice_tenant_fk
      foreign key (tenant_id, invoice_id)
      references public.invoices (tenant_id, id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'refunds_payment_tenant_fk'
      and conrelid = 'public.refunds'::regclass
  ) then
    alter table public.refunds
      add constraint refunds_payment_tenant_fk
      foreign key (tenant_id, payment_id)
      references public.payments (tenant_id, id)
      not valid;
  end if;
end $$;

create index if not exists invoices_dashboard_reporting_idx
  on public.invoices (tenant_id, currency, status, created_at);
create index if not exists invoices_dashboard_due_idx
  on public.invoices (tenant_id, currency, status, due_at)
  where due_at is not null;
create index if not exists payments_dashboard_reporting_idx
  on public.payments (tenant_id, currency, status, received_at)
  where received_at is not null;
create index if not exists refunds_dashboard_reporting_idx
  on public.refunds (tenant_id, status, created_at);

-- Customer employees are tenant profiles, but application ownership belongs to the sole active
-- PRO firm owner. A trigger enforces this for future writes without scanning/blocking legacy rows.
create or replace function public.enforce_service_case_pro_assignee()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;
  perform 1
  from public.profiles
  where id = new.assigned_to
    and tenant_id = new.tenant_id
    and role = 'pro'
    and status = 'active';
  if not found then
    raise exception using errcode = '23514', message = 'INVALID_SERVICE_CASE_ASSIGNEE';
  end if;
  return new;
end;
$$;

drop trigger if exists service_cases_enforce_pro_assignee on public.service_cases;
create trigger service_cases_enforce_pro_assignee
  before insert or update of assigned_to, tenant_id on public.service_cases
  for each row execute function public.enforce_service_case_pro_assignee();
