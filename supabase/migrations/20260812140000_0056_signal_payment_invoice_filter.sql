-- Tenant-scoped, database-paginated collection drilldowns for Signal Studio.
create or replace function public.list_signal_payment_invoices(
  p_tenant_id uuid,
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
  v_today date := coalesce(p_today, (clock_timestamp() at time zone 'Asia/Dubai')::date);
  v_page_size integer := least(100, greatest(1, coalesce(p_page_size, 50)));
  v_requested integer := greatest(1, coalesce(p_page, 1));
  v_page integer;
  v_total bigint;
  v_currency text;
  v_rows jsonb;
begin
  if p_view not in ('billed', 'paid', 'due-soon', 'overdue', 'due-date') then
    raise exception 'invalid payment signal view';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'tenant not found';
  end if;

  select coalesce(
    case when bool_or(currency = 'AED') then 'AED' end,
    (array_agg(currency order by n desc, currency asc))[1],
    'AED'
  ) into v_currency
  from (
    select currency, count(*) n from (
      select i.currency from public.invoices i where i.tenant_id = p_tenant_id
      union all
      select p.currency from public.payments p where p.tenant_id = p_tenant_id
    ) currencies group by currency
  ) ranked;

  with ledger as (
    select p.invoice_id, p.amount_minor::bigint amount_minor
    from public.payments p
    join public.invoices i
      on i.id = p.invoice_id and i.tenant_id = p.tenant_id
    where p.tenant_id = p_tenant_id
      and p.currency = v_currency
      and p.status in ('succeeded', 'refunded', 'partially_refunded')
      and p.received_at is not null
      and (p.received_at at time zone 'Asia/Dubai')::date >= date_trunc('month', v_today)::date
      and (p.received_at at time zone 'Asia/Dubai')::date < (date_trunc('month', v_today) + interval '1 month')::date
    union all
    select p.invoice_id, -r.amount_minor::bigint
    from public.refunds r
    join public.payments p
      on p.id = r.payment_id and p.tenant_id = r.tenant_id
    join public.invoices i
      on i.id = p.invoice_id and i.tenant_id = p.tenant_id
    where r.tenant_id = p_tenant_id
      and p.currency = v_currency
      and r.status = 'succeeded'
      and (r.created_at at time zone 'Asia/Dubai')::date >= date_trunc('month', v_today)::date
      and (r.created_at at time zone 'Asia/Dubai')::date < (date_trunc('month', v_today) + interval '1 month')::date
  ), payment_net as (
    select invoice_id, sum(amount_minor) net_minor from ledger group by invoice_id
  ), filtered as materialized (
    select i.* from public.invoices i
    left join payment_net pn on pn.invoice_id = i.id
    where i.tenant_id = p_tenant_id and i.currency = v_currency and (
      (p_view = 'billed' and i.status not in ('draft', 'void')
        and (i.created_at at time zone 'Asia/Dubai')::date >= date_trunc('month', v_today)::date
        and (i.created_at at time zone 'Asia/Dubai')::date < (date_trunc('month', v_today) + interval '1 month')::date)
      or (p_view = 'paid' and coalesce(pn.net_minor, 0) <> 0)
      or (p_view = 'due-soon' and i.status = 'open' and i.due_at >= v_today and i.due_at <= v_today + 30)
      or (p_view = 'overdue' and i.status = 'open' and i.due_at < v_today)
      or (p_view = 'due-date' and p_date is not null and p_period = 'afternoon'
          and i.status = 'open' and i.due_at = p_date)
    )
  ), metrics as (
    select count(*)::bigint total from filtered
  ), bounds as (
    select total,
      least(v_requested, greatest(1, ceil(total::numeric / v_page_size)::integer)) page
    from metrics
  ), page_rows as (
    select f.* from filtered f cross join bounds b
    order by f.created_at desc
    limit v_page_size offset ((select page - 1 from bounds) * v_page_size)
  )
  select b.total, b.page,
    coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from page_rows p), '[]'::jsonb)
  into v_total, v_page, v_rows
  from bounds b;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page,
    'pageSize', v_page_size, 'currency', v_currency);
end;
$$;

revoke all on function public.list_signal_payment_invoices(uuid,text,integer,integer,date,date,text)
  from public, anon, authenticated;
grant execute on function public.list_signal_payment_invoices(uuid,text,integer,integer,date,date,text)
  to service_role;
