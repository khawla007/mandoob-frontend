-- Company-scoped erasure cleanup and replay-safe refund transitions.

alter table public.refunds
  add column if not exists idempotency_key text,
  add column if not exists provider_idempotency_key text;

create unique index if not exists refunds_tenant_idempotency_key_uidx
  on public.refunds (tenant_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists refunds_provider_idempotency_key_uidx
  on public.refunds (provider_idempotency_key)
  where provider_idempotency_key is not null;

create table public.refund_reconciliation_state (
  worker_name text primary key,
  cursor_created_at timestamptz,
  cursor_id uuid,
  updated_at timestamptz not null default now(),
  constraint refund_reconciliation_cursor_pair_chk check (
    (cursor_created_at is null and cursor_id is null)
    or (cursor_created_at is not null and cursor_id is not null)
  )
);

alter table public.refund_reconciliation_state enable row level security;
revoke all on table public.refund_reconciliation_state from public, anon, authenticated;
grant select, insert, update on table public.refund_reconciliation_state to service_role;

create or replace function public.execute_employee_erasure_cleanup(
  p_request_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_subject_user_id uuid,
  p_actor_id uuid
)
returns table (document_ids uuid[], storage_paths text[])
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_id uuid;
  v_document_ids uuid[] := '{}'::uuid[];
  v_storage_paths text[] := '{}'::text[];
begin
  if p_actor_id is null then
    raise exception using errcode = 'MD403', message = 'erasure_actor_required';
  end if;

  perform 1
  from public.erasure_requests er
  where er.id = p_request_id
    and er.subject_tenant_id = p_tenant_id
    and er.subject_user_id = p_subject_user_id
    and er.subject_kind = 'employee'
    and er.status in ('submitted', 'under_review', 'approved')
  for update;
  if not found then
    raise exception using errcode = 'MD404', message = 'employee_erasure_request_not_found';
  end if;

  select e.id into v_employee_id
  from public.employees e
  where e.tenant_id = p_tenant_id
    and e.company_id = p_company_id
    and e.profile_id = p_subject_user_id
  for update;
  if v_employee_id is null then
    raise exception using errcode = 'MD404', message = 'employee_erasure_subject_not_found';
  end if;

  -- Lock every affected head and all of its versions. This prevents an uploader or
  -- current-version race while the replacement head is selected.
  perform 1
  from public.documents d
  join public.document_versions v on v.document_id = d.id and v.tenant_id = d.tenant_id
  where d.tenant_id = p_tenant_id and d.company_id = p_company_id
    and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id')
    and exists (
      select 1 from public.document_versions owned
      where owned.document_id = d.id
        and owned.tenant_id = p_tenant_id
        and owned.uploaded_by = p_subject_user_id
    )
  for update of d, v;

  select
    coalesce(array_agg(distinct owned.document_id), '{}'::uuid[]),
    coalesce(array_agg(distinct owned.storage_path), '{}'::text[])
  into v_document_ids, v_storage_paths
  from public.document_versions owned
  join public.documents d on d.id = owned.document_id and d.tenant_id = owned.tenant_id
  where d.tenant_id = p_tenant_id and d.company_id = p_company_id
    and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id')
    and owned.uploaded_by = p_subject_user_id;

  with affected as (
    select distinct d.id
    from public.documents d
    join public.document_versions owned
      on owned.document_id = d.id and owned.tenant_id = d.tenant_id
    where d.tenant_id = p_tenant_id and d.company_id = p_company_id
      and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id')
      and owned.uploaded_by = p_subject_user_id
  ), replacement as (
    select affected.id as document_id, remaining.id
    from affected
    left join lateral (
      select remaining.id
      from public.document_versions remaining
      where remaining.document_id = affected.id
        and remaining.tenant_id = p_tenant_id
        and remaining.uploaded_by is distinct from p_subject_user_id
      order by remaining.created_at desc, remaining.id desc
      limit 1
    ) remaining on true
  )
  update public.documents d
  set current_version_id = replacement.id, updated_at = pg_catalog.now()
  from replacement
  where d.id = replacement.document_id
    and d.tenant_id = p_tenant_id
    and d.company_id = p_company_id;

  delete from public.document_versions v
  using public.documents d
  where v.document_id = d.id
    and v.tenant_id = p_tenant_id
    and v.uploaded_by = p_subject_user_id
    and d.tenant_id = p_tenant_id
    and d.company_id = p_company_id
    and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id');

  delete from public.documents d
  where d.tenant_id = p_tenant_id
    and d.company_id = p_company_id
    and d.id = any(v_document_ids)
    and not exists (
      select 1 from public.document_versions remaining
      where remaining.document_id = d.id and remaining.tenant_id = p_tenant_id
    );

  update public.employees e
  set name = '[redacted]', email = null, phone = null,
      passport_no_encrypted = '[redacted]', passport_no_hash = null,
      visa_no_encrypted = '[redacted]', emirates_id_encrypted = '[redacted]',
      updated_at = pg_catalog.now()
  where e.id = v_employee_id and e.tenant_id = p_tenant_id and e.company_id = p_company_id;

  update public.erasure_requests er
  set status = 'approved', reviewed_by = p_actor_id, reviewed_at = pg_catalog.now()
  where er.id = p_request_id
    and er.subject_tenant_id = p_tenant_id
    and er.subject_user_id = p_subject_user_id;
  if not found then
    raise exception using errcode = 'MD409', message = 'employee_erasure_transition_failed';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'erasure_approved', 'admin',
    pg_catalog.jsonb_build_object(
      'request_id', p_request_id,
      'stage', 'employee_cleanup',
      'company_id', p_company_id,
      'employee_id', v_employee_id,
      'document_ids', v_document_ids
    )
  );

  return query select v_document_ids, v_storage_paths;
end;
$$;

revoke all on function public.execute_employee_erasure_cleanup(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.execute_employee_erasure_cleanup(uuid, uuid, uuid, uuid, uuid)
  to service_role;
drop function public.execute_employee_erasure_cleanup(uuid, uuid, uuid, uuid, uuid);

create or replace function public.prepare_company_refund(
  p_tenant_id uuid,
  p_company_id uuid,
  p_invoice_id uuid,
  p_actor_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_idempotency_key text
)
returns table (
  refund_id uuid,
  payment_id uuid,
  provider text,
  provider_charge_id text,
  provider_idempotency_key text,
  refund_status text,
  currency text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_locked_rows record;
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_refund public.refunds%rowtype;
  v_refunded bigint;
  v_refund_id uuid;
begin
  if p_actor_id is null or p_amount_minor <= 0 or pg_catalog.btrim(p_idempotency_key) = '' then
    raise exception using errcode = 'MD400', message = 'invalid_refund_intent';
  end if;

  select i, p into v_locked_rows
  from public.invoices i
  join public.payments p on p.invoice_id = i.id and p.tenant_id = i.tenant_id
  where i.id = p_invoice_id
    and i.tenant_id = p_tenant_id and i.company_id = p_company_id
    and i.status in ('paid', 'partially_refunded')
    and p.status in ('succeeded', 'partially_refunded')
  order by p.created_at desc, p.id desc
  limit 1
  for update of i, p;
  v_invoice := v_locked_rows.i;
  v_payment := v_locked_rows.p;
  if v_invoice.id is null or v_payment.id is null then
    raise exception using errcode = 'MD404', message = 'owned_refundable_invoice_not_found';
  end if;

  select r.* into v_refund
  from public.refunds r
  where r.tenant_id = p_tenant_id and r.idempotency_key = p_idempotency_key
  for update;
  if v_refund.id is not null then
    if v_refund.payment_id <> v_payment.id
      or v_refund.amount_minor <> p_amount_minor
      or v_refund.reason is distinct from p_reason then
      raise exception using errcode = 'MD409', message = 'refund_idempotency_conflict';
    end if;
    return query select v_refund.id, v_payment.id, v_payment.provider,
      v_payment.provider_charge_id, v_refund.provider_idempotency_key,
      v_refund.status, v_payment.currency;
    return;
  end if;

  select coalesce(pg_catalog.sum(r.amount_minor), 0)::bigint into v_refunded
  from public.refunds r
  where r.tenant_id = p_tenant_id and r.payment_id = v_payment.id and r.status <> 'failed';
  if p_amount_minor > v_payment.amount_minor - v_refunded then
    raise exception using errcode = 'MD409', message = 'refund_exceeds_remaining_amount';
  end if;

  v_refund_id := gen_random_uuid();
  insert into public.refunds (
    id, tenant_id, payment_id, amount_minor, reason, status,
    idempotency_key, provider_idempotency_key
  ) values (
    v_refund_id, p_tenant_id, v_payment.id, p_amount_minor, p_reason, 'pending',
    p_idempotency_key, 'mandoob-refund-' || v_refund_id::text
  )
  on conflict (tenant_id, idempotency_key) where idempotency_key is not null
  do nothing;

  select r.* into v_refund
  from public.refunds r
  where r.tenant_id = p_tenant_id and r.idempotency_key = p_idempotency_key
  for update;
  if v_refund.id is null then
    raise exception using errcode = 'MD409', message = 'refund_intent_not_persisted';
  end if;
  if v_refund.payment_id <> v_payment.id
    or v_refund.amount_minor <> p_amount_minor
    or v_refund.reason is distinct from p_reason then
    raise exception using errcode = 'MD409', message = 'refund_idempotency_conflict';
  end if;

  return query select v_refund.id, v_payment.id, v_payment.provider,
    v_payment.provider_charge_id, v_refund.provider_idempotency_key,
    v_refund.status, v_payment.currency;
end;
$$;

revoke all on function public.prepare_company_refund(uuid, uuid, uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.prepare_company_refund(uuid, uuid, uuid, uuid, bigint, text, text)
  to service_role;

create or replace function public.reconcile_company_refund(
  p_tenant_id uuid,
  p_company_id uuid,
  p_refund_id uuid,
  p_actor_id uuid,
  p_provider_refund_id text,
  p_status text,
  p_ip text
)
returns table (refund_id uuid, partial boolean, refund_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_locked_rows record;
  v_refund public.refunds%rowtype;
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_succeeded_refunds bigint;
  v_partial boolean;
begin
  if p_status not in ('pending', 'succeeded', 'failed') then
    raise exception using errcode = 'MD400', message = 'invalid_refund_status';
  end if;

  select r, p, i into v_locked_rows
  from public.refunds r
  join public.payments p on p.id = r.payment_id and p.tenant_id = r.tenant_id
  join public.invoices i on i.id = p.invoice_id and i.tenant_id = p.tenant_id
  where r.id = p_refund_id and r.tenant_id = p_tenant_id
    and i.tenant_id = p_tenant_id and i.company_id = p_company_id
  for update of r, p, i;
  v_refund := v_locked_rows.r;
  v_payment := v_locked_rows.p;
  v_invoice := v_locked_rows.i;
  if v_refund.id is null then
    raise exception using errcode = 'MD404', message = 'owned_refund_intent_not_found';
  end if;

  if v_refund.status = 'succeeded' then
    v_partial := v_invoice.status = 'partially_refunded';
    return query select v_refund.id, v_partial, v_refund.status;
    return;
  end if;

  update public.refunds r
  set provider_refund_id = coalesce(p_provider_refund_id, r.provider_refund_id), status = p_status
  where r.id = v_refund.id and r.tenant_id = p_tenant_id;

  if p_status = 'succeeded' then
    select coalesce(pg_catalog.sum(r.amount_minor), 0)::bigint into v_succeeded_refunds
    from public.refunds r
    where r.tenant_id = p_tenant_id and r.payment_id = v_payment.id and r.status = 'succeeded';
    v_partial := v_succeeded_refunds < v_payment.amount_minor;

    update public.payments p
    set status = case when v_partial then 'partially_refunded' else 'refunded' end
    where p.id = v_payment.id and p.tenant_id = p_tenant_id;
    if not found then
      raise exception using errcode = 'MD409', message = 'refund_payment_transition_failed';
    end if;

    update public.invoices i
    set status = case when v_partial then 'partially_refunded' else 'refunded' end
    where i.id = v_invoice.id and i.tenant_id = p_tenant_id and i.company_id = p_company_id;
    if not found then
      raise exception using errcode = 'MD409', message = 'refund_invoice_transition_failed';
    end if;

    insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
    values (
      p_tenant_id, p_actor_id, 'refund_issued', 'admin',
      pg_catalog.jsonb_build_object(
        'refund_id', v_refund.id, 'payment_id', v_payment.id,
        'invoice_id', v_invoice.id, 'company_id', p_company_id,
        'amount_minor', v_refund.amount_minor, 'ip', p_ip
      )
    );
  else
    v_partial := true;
  end if;

  return query select v_refund.id, v_partial, p_status;
end;
$$;

revoke all on function public.reconcile_company_refund(uuid, uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_company_refund(uuid, uuid, uuid, uuid, text, text, text)
  to service_role;

create or replace function public.mark_company_invoice_paid(
  p_tenant_id uuid,
  p_company_id uuid,
  p_invoice_id uuid,
  p_actor_id uuid,
  p_method text,
  p_note text,
  p_ip text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_updated_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  if p_method not in ('cash', 'bank_transfer') then
    raise exception using errcode = 'MD400', message = 'invalid_manual_payment_method';
  end if;
  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.tenant_id = p_tenant_id and i.company_id = p_company_id
  for update;
  if v_invoice.id is null then
    raise exception using errcode = 'MD404', message = 'owned_invoice_not_found';
  end if;
  if v_invoice.status not in ('open', 'draft') then
    raise exception using errcode = 'MD409', message = 'invoice_not_payable';
  end if;

  insert into public.payments (
    tenant_id, invoice_id, provider, amount_minor, currency, method, status, received_at
  ) values (
    p_tenant_id, v_invoice.id, 'manual', v_invoice.amount_minor,
    v_invoice.currency, p_method, 'succeeded', v_now
  ) returning id into v_payment_id;

  update public.invoices i
  set status = 'paid', paid_at = v_now
  where i.id = v_invoice.id
    and i.tenant_id = p_tenant_id and i.company_id = p_company_id
    and i.status in ('open', 'draft')
  returning i.id into v_updated_id;
  if v_updated_id is null then
    raise exception using errcode = 'MD409', message = 'invoice_payment_transition_failed';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'invoice_marked_paid', 'admin',
    pg_catalog.jsonb_build_object(
      'invoice_id', v_invoice.id, 'payment_id', v_payment_id,
      'company_id', p_company_id, 'method', p_method, 'note', p_note, 'ip', p_ip
    )
  );
  return v_payment_id;
end;
$$;

revoke all on function public.mark_company_invoice_paid(uuid, uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_company_invoice_paid(uuid, uuid, uuid, uuid, text, text, text)
  to service_role;

create or replace function public.void_company_invoice(
  p_tenant_id uuid,
  p_company_id uuid,
  p_invoice_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_ip text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_updated_id uuid;
begin
  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.tenant_id = p_tenant_id and i.company_id = p_company_id
  for update;
  if v_invoice.id is null then
    raise exception using errcode = 'MD404', message = 'owned_invoice_not_found';
  end if;
  if v_invoice.status not in ('open', 'draft') then
    raise exception using errcode = 'MD409', message = 'invoice_not_voidable';
  end if;

  update public.invoices i
  set status = 'void', void_reason = p_reason
  where i.id = v_invoice.id
    and i.tenant_id = p_tenant_id and i.company_id = p_company_id
    and i.status in ('open', 'draft')
  returning i.id into v_updated_id;
  if v_updated_id is null then
    raise exception using errcode = 'MD409', message = 'invoice_void_transition_failed';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'invoice_voided', 'admin',
    pg_catalog.jsonb_build_object(
      'invoice_id', v_invoice.id, 'company_id', p_company_id,
      'reason', p_reason, 'ip', p_ip
    )
  );
  return v_invoice.id;
end;
$$;

revoke all on function public.void_company_invoice(uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.void_company_invoice(uuid, uuid, uuid, uuid, text, text)
  to service_role;

create or replace function public.list_company_payment_invoices(
  p_tenant_id uuid,
  p_company_id uuid,
  p_view text,
  p_page integer default 1,
  p_page_size integer default 50,
  p_today date default null,
  p_date date default null,
  p_period text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_today date := coalesce(p_today, (pg_catalog.clock_timestamp() at time zone 'Asia/Dubai')::date);
  v_page_size integer := least(100, greatest(1, coalesce(p_page_size, 50)));
  v_requested integer := greatest(1, coalesce(p_page, 1));
  v_page integer;
  v_total bigint;
  v_currency text;
  v_rows jsonb;
begin
  if p_view not in ('billed', 'paid', 'due-soon', 'overdue', 'due-date') then
    raise exception using errcode = 'MD400', message = 'invalid_payment_view';
  end if;
  if not exists (
    select 1 from public.company_profiles c
    where c.id = p_company_id and c.tenant_id = p_tenant_id
  ) then
    raise exception using errcode = 'MD404', message = 'company_not_found';
  end if;

  select coalesce(
    case when pg_catalog.bool_or(currency = 'AED') then 'AED' end,
    (pg_catalog.array_agg(currency order by n desc, currency asc))[1],
    'AED'
  ) into v_currency
  from (
    select currency, pg_catalog.count(*) n from (
      select i.currency from public.invoices i
      where i.tenant_id = p_tenant_id and i.company_id = p_company_id
      union all
      select p.currency from public.payments p
      join public.invoices i on i.id = p.invoice_id and i.tenant_id = p.tenant_id
      where p.tenant_id = p_tenant_id and i.company_id = p_company_id
    ) currencies group by currency
  ) ranked;

  with ledger as (
    select p.invoice_id, p.amount_minor::bigint amount_minor
    from public.payments p
    join public.invoices i on i.id = p.invoice_id and i.tenant_id = p.tenant_id
    where p.tenant_id = p_tenant_id and i.company_id = p_company_id
      and p.currency = v_currency
      and p.status in ('succeeded', 'refunded', 'partially_refunded')
      and p.received_at is not null
      and (p.received_at at time zone 'Asia/Dubai')::date >= pg_catalog.date_trunc('month', v_today)::date
      and (p.received_at at time zone 'Asia/Dubai')::date < (pg_catalog.date_trunc('month', v_today) + interval '1 month')::date
    union all
    select p.invoice_id, -r.amount_minor::bigint
    from public.refunds r
    join public.payments p on p.id = r.payment_id and p.tenant_id = r.tenant_id
    join public.invoices i on i.id = p.invoice_id and i.tenant_id = p.tenant_id
    where r.tenant_id = p_tenant_id and i.company_id = p_company_id
      and p.currency = v_currency and r.status = 'succeeded'
      and (r.created_at at time zone 'Asia/Dubai')::date >= pg_catalog.date_trunc('month', v_today)::date
      and (r.created_at at time zone 'Asia/Dubai')::date < (pg_catalog.date_trunc('month', v_today) + interval '1 month')::date
  ), payment_net as (
    select invoice_id, pg_catalog.sum(amount_minor) net_minor from ledger group by invoice_id
  ), filtered as materialized (
    select i.* from public.invoices i
    left join payment_net pn on pn.invoice_id = i.id
    where i.tenant_id = p_tenant_id and i.company_id = p_company_id
      and i.currency = v_currency and (
        (p_view = 'billed' and i.status not in ('draft', 'void')
          and (i.created_at at time zone 'Asia/Dubai')::date >= pg_catalog.date_trunc('month', v_today)::date
          and (i.created_at at time zone 'Asia/Dubai')::date < (pg_catalog.date_trunc('month', v_today) + interval '1 month')::date)
        or (p_view = 'paid' and coalesce(pn.net_minor, 0) <> 0)
        or (p_view = 'due-soon' and i.status = 'open' and i.due_at >= v_today and i.due_at <= v_today + 30)
        or (p_view = 'overdue' and i.status = 'open' and i.due_at < v_today)
        or (p_view = 'due-date' and p_date is not null and p_period = 'afternoon'
          and i.status = 'open' and i.due_at = p_date)
      )
  ), metrics as (
    select pg_catalog.count(*)::bigint total from filtered
  ), bounds as (
    select total,
      least(v_requested, greatest(1, pg_catalog.ceil(total::numeric / v_page_size)::integer)) page
    from metrics
  ), page_rows as (
    select f.* from filtered f cross join bounds b
    order by f.created_at desc, f.id desc
    limit v_page_size offset ((select page - 1 from bounds) * v_page_size)
  )
  select b.total, b.page,
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.created_at desc, p.id desc)
      from page_rows p), '[]'::jsonb)
  into v_total, v_page, v_rows
  from bounds b;

  return pg_catalog.jsonb_build_object(
    'rows', v_rows, 'total', v_total, 'page', v_page,
    'pageSize', v_page_size, 'currency', v_currency
  );
end;
$$;

revoke all on function public.list_company_payment_invoices(uuid, uuid, text, integer, integer, date, date, text)
  from public, anon, authenticated;
grant execute on function public.list_company_payment_invoices(uuid, uuid, text, integer, integer, date, date, text)
  to service_role;

create or replace function public.create_company_invoice(
  p_tenant_id uuid,
  p_company_id uuid,
  p_customer_profile_id uuid,
  p_linked_entity_type text,
  p_linked_entity_id text,
  p_label text,
  p_amount_minor bigint,
  p_currency text,
  p_due_at date,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice_id uuid;
begin
  if p_amount_minor < 0 or pg_catalog.btrim(p_label) = '' then
    raise exception using errcode = 'MD400', message = 'invalid_invoice';
  end if;

  perform 1
  from public.company_profiles company
  where company.tenant_id = p_tenant_id
    and company.id = p_company_id;
  if not found then
    raise exception using errcode = 'MD404', message = 'owned_company_not_found';
  end if;

  if p_customer_profile_id is not null then
    perform 1
    from public.customer_profiles customer
    where customer.profile_id = p_customer_profile_id
      and customer.linked_company_id = p_company_id;
    if not found then
      raise exception using errcode = 'MD403', message = 'customer_outside_company';
    end if;
  end if;

  insert into public.invoices (
    tenant_id, company_id, customer_profile_id, linked_entity_type,
    linked_entity_id, label, amount_minor, currency, status, due_at, created_by
  ) values (
    p_tenant_id, p_company_id, p_customer_profile_id, p_linked_entity_type,
    p_linked_entity_id, p_label, p_amount_minor, p_currency, 'open', p_due_at, p_created_by
  )
  returning id into v_invoice_id;

  if v_invoice_id is null then
    raise exception using errcode = 'MD409', message = 'invoice_insert_failed';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id,
    p_created_by,
    'invoice_created',
    case when p_created_by is null then 'system' else 'admin' end,
    pg_catalog.jsonb_build_object(
      'entity', 'invoice',
      'invoice_id', v_invoice_id,
      'company_id', p_company_id,
      'amount_minor', p_amount_minor,
      'currency', p_currency,
      'linked_entity_type', p_linked_entity_type,
      'linked_entity_id', p_linked_entity_id
    )
  );

  return v_invoice_id;
end;
$$;

revoke all on function public.create_company_invoice(
  uuid, uuid, uuid, text, text, text, bigint, text, date, uuid
) from public, anon, authenticated;
grant execute on function public.create_company_invoice(
  uuid, uuid, uuid, text, text, text, bigint, text, date, uuid
) to service_role;

create table public.erasure_cleanup_jobs (
  request_id uuid primary key references public.erasure_requests(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.company_profiles(id) on delete restrict,
  subject_user_id uuid not null references public.profiles(id) on delete restrict,
  subject_kind public.erasure_subject_kind not null,
  document_ids uuid[] not null default '{}'::uuid[],
  storage_paths text[] not null default '{}'::text[],
  anonymization_diff jsonb not null default '{}'::jsonb,
  storage_deleted_at timestamptz,
  auth_anonymized_at timestamptz,
  completion_notification_queued_at timestamptz,
  attempts integer not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.erasure_cleanup_jobs enable row level security;

create or replace function public.prepare_erasure_cleanup(
  p_request_id uuid,
  p_tenant_id uuid,
  p_subject_user_id uuid,
  p_actor_id uuid
)
returns table (
  request_id uuid,
  company_id uuid,
  subject_kind text,
  document_ids uuid[],
  storage_paths text[],
  anonymization_diff jsonb,
  storage_deleted_at timestamptz,
  auth_anonymized_at timestamptz,
  completion_notification_queued_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.erasure_requests%rowtype;
  v_company_id uuid;
  v_employee_id uuid;
  v_document_ids uuid[] := '{}'::uuid[];
  v_storage_paths text[] := '{}'::text[];
  v_diff jsonb;
begin
  select er.* into v_request
  from public.erasure_requests er
  where er.id = p_request_id
    and er.subject_tenant_id = p_tenant_id
    and er.subject_user_id = p_subject_user_id
    and er.subject_kind in ('employee', 'customer')
    and er.status in ('submitted', 'under_review', 'approved', 'completed')
  for update;
  if v_request.id is null then
    raise exception using errcode = 'MD404', message = 'erasure_request_not_found';
  end if;

  return query
  select j.request_id, j.company_id, j.subject_kind::text, j.document_ids, j.storage_paths,
    j.anonymization_diff, j.storage_deleted_at, j.auth_anonymized_at,
    j.completion_notification_queued_at
  from public.erasure_cleanup_jobs j
  where j.request_id = p_request_id and j.tenant_id = p_tenant_id
  for update;
  if found then
    update public.erasure_cleanup_jobs j
    set attempts = j.attempts + 1, updated_at = pg_catalog.now()
    where j.request_id = p_request_id and j.tenant_id = p_tenant_id;
    return;
  end if;
  if v_request.status = 'completed' then
    raise exception using errcode = 'MD409', message = 'completed_erasure_job_missing';
  end if;

  if v_request.subject_kind = 'employee' then
    select e.id, e.company_id into v_employee_id, v_company_id
    from public.employees e
    where e.tenant_id = p_tenant_id and e.profile_id = p_subject_user_id
    for update;
  else
    select customer.linked_company_id into v_company_id
    from public.customer_profiles customer
    join public.profiles profile on profile.id = customer.profile_id
    where customer.profile_id = p_subject_user_id
      and profile.tenant_id = p_tenant_id
      and customer.linked_company_id is not null
    for update of customer, profile;
  end if;

  if v_company_id is null then
    raise exception using errcode = 'MD404', message = 'erasure_subject_company_not_found';
  end if;

  if v_request.subject_kind = 'employee' then
    perform 1
    from public.documents d
    where d.tenant_id = p_tenant_id and d.company_id = v_company_id
      and d.employee_id = v_employee_id
      and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id')
    for update of d;

    perform 1
    from public.document_versions v
    join public.documents d on d.id = v.document_id and d.tenant_id = v.tenant_id
    where d.tenant_id = p_tenant_id and d.company_id = v_company_id
      and d.employee_id = v_employee_id
      and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id')
    for update of v;

    select coalesce(pg_catalog.array_agg(d.id), '{}'::uuid[])
    into v_document_ids
    from public.documents d
    where d.tenant_id = p_tenant_id and d.company_id = v_company_id
      and d.employee_id = v_employee_id
      and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id');

    select coalesce(pg_catalog.array_agg(distinct owned.storage_path), '{}'::text[])
    into v_storage_paths
    from public.document_versions owned
    join public.documents d on d.id = owned.document_id and d.tenant_id = owned.tenant_id
    where d.tenant_id = p_tenant_id and d.company_id = v_company_id
      and d.employee_id = v_employee_id
      and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id');

    update public.documents d
    set current_version_id = null, updated_at = pg_catalog.now()
    where d.tenant_id = p_tenant_id and d.company_id = v_company_id
      and d.employee_id = v_employee_id and d.id = any(v_document_ids);

    delete from public.document_versions v
    using public.documents d
    where v.document_id = d.id and v.tenant_id = p_tenant_id
      and d.tenant_id = p_tenant_id and d.company_id = v_company_id
      and d.employee_id = v_employee_id
      and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id');
  else
    perform 1
    from public.documents d
    join public.document_versions v on v.document_id = d.id and v.tenant_id = d.tenant_id
    where d.tenant_id = p_tenant_id and d.company_id = v_company_id
      and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id')
      and exists (
        select 1 from public.document_versions owned
        where owned.document_id = d.id and owned.tenant_id = p_tenant_id
          and owned.uploaded_by = p_subject_user_id
      )
    for update of d, v;

    select coalesce(pg_catalog.array_agg(distinct owned.document_id), '{}'::uuid[]),
      coalesce(pg_catalog.array_agg(distinct owned.storage_path), '{}'::text[])
    into v_document_ids, v_storage_paths
    from public.document_versions owned
    join public.documents d on d.id = owned.document_id and d.tenant_id = owned.tenant_id
    where d.tenant_id = p_tenant_id and d.company_id = v_company_id
      and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id')
      and owned.uploaded_by = p_subject_user_id;

    with affected as (
      select distinct d.id
      from public.documents d
      join public.document_versions owned
        on owned.document_id = d.id and owned.tenant_id = d.tenant_id
      where d.tenant_id = p_tenant_id and d.company_id = v_company_id
        and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id')
        and owned.uploaded_by = p_subject_user_id
    ), replacement as (
      select affected.id as document_id, remaining.id
      from affected
      left join lateral (
        select remaining.id
        from public.document_versions remaining
        where remaining.document_id = affected.id and remaining.tenant_id = p_tenant_id
          and remaining.uploaded_by is distinct from p_subject_user_id
        order by remaining.created_at desc, remaining.id desc
        limit 1
      ) remaining on true
    )
    update public.documents d
    set current_version_id = replacement.id, updated_at = pg_catalog.now()
    from replacement
    where d.id = replacement.document_id
      and d.tenant_id = p_tenant_id and d.company_id = v_company_id;

    delete from public.document_versions v
    using public.documents d
    where v.document_id = d.id and v.tenant_id = p_tenant_id
      and v.uploaded_by = p_subject_user_id
      and d.tenant_id = p_tenant_id and d.company_id = v_company_id
      and d.doc_type in ('passport', 'visa', 'emirates_id', 'shareholder_id');
  end if;

  delete from public.documents d
  where d.tenant_id = p_tenant_id and d.company_id = v_company_id
    and d.id = any(v_document_ids)
    and not exists (
      select 1 from public.document_versions remaining
      where remaining.document_id = d.id and remaining.tenant_id = p_tenant_id
    );

  update public.profiles profile
  set full_name = '[redacted]', phone = null, username = null, title = null, bio = null,
    updated_at = pg_catalog.now()
  where profile.id = p_subject_user_id and profile.tenant_id = p_tenant_id;

  if v_request.subject_kind = 'employee' then
    update public.employees e
    set name = '[redacted]', email = null, phone = null,
      passport_no_encrypted = '[redacted]', passport_no_hash = null,
      visa_no_encrypted = '[redacted]', emirates_id_encrypted = '[redacted]',
      updated_at = pg_catalog.now()
    where e.id = v_employee_id and e.tenant_id = p_tenant_id
      and e.company_id = v_company_id and e.profile_id = p_subject_user_id;
  else
    update public.customer_profiles customer
    set nationality = null, passport_no_encrypted = '[redacted]'
    where customer.profile_id = p_subject_user_id
      and customer.linked_company_id = v_company_id;
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(v_storage_paths) as paths(storage_path)
    where paths.storage_path not like p_tenant_id::text || '/' || v_company_id::text || '/%'
      or paths.storage_path like '%/../%'
      or paths.storage_path like '%/./%'
      or paths.storage_path like '%\%%' escape '\'
      or paths.storage_path like '%\\%'
  ) then
    raise exception using errcode = 'MD409', message = 'invalid_erasure_storage_path';
  end if;

  v_diff := pg_catalog.jsonb_build_object(
    'subject_kind', v_request.subject_kind,
    'documents', pg_catalog.jsonb_build_object(
      'documentIds', v_document_ids, 'storagePaths', v_storage_paths
    )
  );

  insert into public.erasure_cleanup_jobs (
    request_id, tenant_id, company_id, subject_user_id, subject_kind,
    document_ids, storage_paths, anonymization_diff
  ) values (
    p_request_id, p_tenant_id, v_company_id, p_subject_user_id, v_request.subject_kind,
    v_document_ids, v_storage_paths, v_diff
  )
  on conflict (request_id) do update
  set storage_paths = public.erasure_cleanup_jobs.storage_paths,
      attempts = public.erasure_cleanup_jobs.attempts + 1,
      updated_at = pg_catalog.now();

  update public.erasure_requests er
  set status = 'approved', reviewed_by = p_actor_id,
    reviewed_at = coalesce(er.reviewed_at, pg_catalog.now()), anonymization_diff = v_diff
  where er.id = p_request_id and er.subject_tenant_id = p_tenant_id
    and er.subject_user_id = p_subject_user_id;
  if not found then
    raise exception using errcode = 'MD409', message = 'erasure_approval_failed';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'erasure_approved', 'admin',
    pg_catalog.jsonb_build_object(
      'request_id', p_request_id, 'company_id', v_company_id,
      'subject_kind', v_request.subject_kind, 'document_ids', v_document_ids
    )
  );

  return query
  select j.request_id, j.company_id, j.subject_kind::text, j.document_ids, j.storage_paths,
    j.anonymization_diff, j.storage_deleted_at, j.auth_anonymized_at,
    j.completion_notification_queued_at
  from public.erasure_cleanup_jobs j
  where j.request_id = p_request_id and j.tenant_id = p_tenant_id;
end;
$$;

revoke all on function public.prepare_erasure_cleanup(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_erasure_cleanup(uuid, uuid, uuid, uuid)
  to service_role;

create or replace function public.mark_erasure_cleanup_step(
  p_request_id uuid,
  p_tenant_id uuid,
  p_step text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_step not in ('storage', 'auth', 'notification') then
    raise exception using errcode = 'MD400', message = 'invalid_erasure_cleanup_step';
  end if;
  update public.erasure_cleanup_jobs j
  set storage_deleted_at = case when p_step = 'storage' then pg_catalog.now() else j.storage_deleted_at end,
      auth_anonymized_at = case when p_step = 'auth' then pg_catalog.now() else j.auth_anonymized_at end,
      completion_notification_queued_at = case
        when p_step = 'notification' then pg_catalog.now()
        else j.completion_notification_queued_at
      end,
      last_error = null,
      updated_at = pg_catalog.now()
  where j.request_id = p_request_id and j.tenant_id = p_tenant_id;
  if not found then
    raise exception using errcode = 'MD404', message = 'erasure_cleanup_job_not_found';
  end if;
end;
$$;

revoke all on function public.mark_erasure_cleanup_step(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_erasure_cleanup_step(uuid, uuid, text)
  to service_role;

create or replace function public.complete_erasure_cleanup(
  p_request_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.erasure_cleanup_jobs%rowtype;
begin
  select j.* into v_job
  from public.erasure_cleanup_jobs j
  where j.request_id = p_request_id and j.tenant_id = p_tenant_id
  for update;
  if v_job.request_id is null then
    raise exception using errcode = 'MD404', message = 'erasure_cleanup_job_not_found';
  end if;
  if v_job.storage_deleted_at is null or v_job.auth_anonymized_at is null then
    raise exception using errcode = 'MD409', message = 'erasure_cleanup_incomplete';
  end if;

  update public.erasure_requests er
  set status = 'completed', completed_at = coalesce(er.completed_at, pg_catalog.now()),
    anonymization_diff = v_job.anonymization_diff
  where er.id = p_request_id and er.subject_tenant_id = p_tenant_id
    and er.subject_user_id = v_job.subject_user_id
    and er.status in ('approved', 'completed');
  if not found then
    raise exception using errcode = 'MD409', message = 'erasure_completion_failed';
  end if;

  if not exists (
    select 1 from public.tenant_audit_log a
    where a.tenant_id = p_tenant_id and a.action = 'erasure_completed'
      and a.details ->> 'request_id' = p_request_id::text
  ) then
    insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
    values (
      p_tenant_id, p_actor_id, 'erasure_completed', 'admin',
      pg_catalog.jsonb_build_object(
        'request_id', p_request_id, 'subject_kind', v_job.subject_kind,
        'documents_deleted', v_job.document_ids
      )
    );
  end if;
  return v_job.anonymization_diff;
end;
$$;

revoke all on function public.complete_erasure_cleanup(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_erasure_cleanup(uuid, uuid, uuid)
  to service_role;

create or replace function public.update_company_service_case_with_audit(
  p_tenant_id uuid,
  p_company_id uuid,
  p_actor_id uuid,
  p_case_id uuid,
  p_patch jsonb,
  p_changed_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_case_id uuid;
begin
  perform 1 from public.pro_company_assignments assignment
  where assignment.tenant_id = p_tenant_id and assignment.company_id = p_company_id
    and assignment.pro_profile_id = p_actor_id and assignment.status = 'active'
    and assignment.released_at is null
  for share;
  if not found then
    raise exception using errcode = 'MD403', message = 'active_company_assignment_required';
  end if;

  update public.service_cases service_case
  set status = case when p_patch ? 'status' then p_patch ->> 'status' else service_case.status end,
    priority = case when p_patch ? 'priority' then p_patch ->> 'priority' else service_case.priority end,
    assigned_to = case when p_patch ? 'assigned_to' then (p_patch ->> 'assigned_to')::uuid else service_case.assigned_to end,
    due_at = case when p_patch ? 'due_at' then (p_patch ->> 'due_at')::timestamptz else service_case.due_at end,
    sla_due_at = case when p_patch ? 'sla_due_at' then (p_patch ->> 'sla_due_at')::timestamptz else service_case.sla_due_at end,
    blocked_reason = case when p_patch ? 'blocked_reason' then p_patch ->> 'blocked_reason' else service_case.blocked_reason end,
    completed_at = case when p_patch ? 'completed_at' then (p_patch ->> 'completed_at')::timestamptz else service_case.completed_at end
  where service_case.id = p_case_id and service_case.tenant_id = p_tenant_id
    and service_case.company_id = p_company_id
  returning service_case.id into v_case_id;
  if v_case_id is null then
    raise exception using errcode = 'MD404', message = 'owned_service_case_not_found';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'service_case_updated', 'self_serve',
    pg_catalog.jsonb_build_object(
      'entity', 'service_case', 'id', v_case_id, 'company_id', p_company_id,
      'changed_keys', pg_catalog.to_jsonb(p_changed_keys)
    )
  );
  return v_case_id;
end;
$$;

revoke all on function public.update_company_service_case_with_audit(
  uuid, uuid, uuid, uuid, jsonb, text[]
) from public, anon, authenticated;
grant execute on function public.update_company_service_case_with_audit(
  uuid, uuid, uuid, uuid, jsonb, text[]
) to service_role;
