-- P3.09 immutable receipts, accounting reports, and bounded finance exports.
begin;

create table public.subscription_status_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  status text not null check (status in ('trialing','active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused')),
  amount_minor bigint not null check (amount_minor between 0 and 100000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  interval text not null check (interval in ('month','year')),
  valid_from timestamptz not null,
  valid_to timestamptz,
  check (valid_to is null or valid_to > valid_from),
  unique (subscription_id, valid_from)
);

create unique index subscription_status_history_current_idx
  on public.subscription_status_history(subscription_id) where valid_to is null;
create index subscription_status_history_period_idx
  on public.subscription_status_history(valid_from,valid_to,status,currency,subscription_id);
alter table public.subscription_status_history enable row level security;
revoke all on table public.subscription_status_history from public,anon,authenticated;
grant select,insert,update on table public.subscription_status_history to service_role;

-- Preserve the only historical transition available for legacy canceled rows.
insert into public.subscription_status_history(
  subscription_id,tenant_id,status,amount_minor,currency,interval,valid_from,valid_to
)
select subscription.id,subscription.tenant_id,'active',subscription.unit_amount_minor,
  pg_catalog.upper(subscription.currency),subscription.interval,subscription.created_at,
  subscription.canceled_at
from public.subscriptions subscription
where subscription.status='canceled' and subscription.canceled_at is not null
  and subscription.canceled_at>subscription.created_at;

insert into public.subscription_status_history(
  subscription_id,tenant_id,status,amount_minor,currency,interval,valid_from
)
select subscription.id,subscription.tenant_id,subscription.status,subscription.unit_amount_minor,
  pg_catalog.upper(subscription.currency),subscription.interval,
  case when subscription.status='canceled' and subscription.canceled_at is not null
      and subscription.canceled_at>subscription.created_at
    then subscription.canceled_at else subscription.created_at end
from public.subscriptions subscription;

create function private.p309_capture_subscription_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if tg_op='UPDATE' and (old.status,old.unit_amount_minor,old.currency,old.interval)
      is not distinct from (new.status,new.unit_amount_minor,new.currency,new.interval) then
    return new;
  end if;
  if tg_op='UPDATE' then
    update public.subscription_status_history set valid_to=v_now
    where subscription_id=old.id and valid_to is null;
  end if;
  insert into public.subscription_status_history(
    subscription_id,tenant_id,status,amount_minor,currency,interval,valid_from
  ) values(new.id,new.tenant_id,new.status,new.unit_amount_minor,pg_catalog.upper(new.currency),new.interval,
    case when tg_op='INSERT' then new.created_at else v_now end);
  return new;
end;
$$;

create trigger subscriptions_p309_history
after insert or update of status,unit_amount_minor,currency,interval on public.subscriptions
for each row execute function private.p309_capture_subscription_status();

create function private.p309_assert_report_scope(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid
) returns void language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  select profile.role into v_role from public.profiles profile
  where profile.id=p_actor_id and profile.status='active';
  if v_role in ('admin','super_admin') then
    if exists(select 1 from public.profiles profile where profile.id=p_actor_id and profile.tenant_id is not null)
    then raise exception using errcode='42501',message='FORBIDDEN'; end if;
    if p_company_id is not null and not exists(
      select 1 from public.company_profiles company where company.id=p_company_id
        and (p_tenant_id is null or company.tenant_id=p_tenant_id)
    ) then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
    return;
  end if;
  if v_role='pro' and p_tenant_id is not null and p_company_id is not null and exists(
    select 1 from public.pro_company_assignments assignment
    where assignment.pro_profile_id=p_actor_id and assignment.tenant_id=p_tenant_id
      and assignment.company_id=p_company_id and assignment.status='active'
  ) then return; end if;
  raise exception using errcode='42501',message='FORBIDDEN';
end;
$$;

create function public.p309_finance_report(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_customer_profile_id uuid,
  p_start_at timestamptz,p_end_at timestamptz
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform private.p309_assert_report_scope(p_actor_id,p_tenant_id,p_company_id);
  if p_start_at is null or p_end_at is null or p_start_at>=p_end_at then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if p_customer_profile_id is not null and (p_tenant_id is null or p_company_id is null or not exists(
    select 1 from public.invoices invoice where invoice.tenant_id=p_tenant_id
      and invoice.company_id=p_company_id and invoice.customer_profile_id=p_customer_profile_id
  )) then raise exception using errcode='P0002',message='NOT_FOUND'; end if;

  with scoped as (
    select journal.id,journal.source_kind,journal.source_id,journal.currency,journal.accounting_at,
      entry.account_code,entry.debit_minor,entry.credit_minor
    from public.finance_journals journal
    join public.finance_journal_entries entry on entry.journal_id=journal.id
    left join public.invoices invoice on invoice.id=journal.source_id
      and journal.source_kind in ('invoice','subscription_invoice','invoice_void')
    left join public.payment_allocations allocation on allocation.id=journal.source_id
      and journal.source_kind='payment_allocation'
    left join public.finance_credit_notes note on note.id=journal.source_id
      and journal.source_kind='credit_note'
    left join public.refunds refund on refund.id=journal.source_id and journal.source_kind='cash_refund'
    left join public.payments refund_payment on refund_payment.id=refund.payment_id
    where journal.state = 'posted' and journal.accounting_at < p_end_at
      and (p_tenant_id is null or journal.tenant_id=p_tenant_id)
      and (p_company_id is null or journal.company_id=p_company_id)
      and (p_customer_profile_id is null or coalesce(invoice.customer_profile_id,
        (select linked.customer_profile_id from public.invoices linked where linked.id=allocation.invoice_id),
        (select linked.customer_profile_id from public.invoices linked where linked.id=note.invoice_id),
        (select linked.customer_profile_id from public.invoices linked where linked.id=refund_payment.invoice_id)
      )=p_customer_profile_id)
  ), currency_totals as (
    select currency,
      coalesce(sum(debit_minor-credit_minor) filter(where accounting_at >= p_start_at
        and account_code in ('cash_clearing','bank_clearing')
        and source_kind in ('payment_allocation','cash_refund')),0)::bigint cash_collected_minor,
      coalesce(sum(debit_minor-credit_minor) filter(where accounting_at >= p_start_at
        and account_code='receivable'
        and source_kind in ('invoice','subscription_invoice','credit_note','invoice_void')),0)::bigint billed_minor,
      coalesce(sum(debit_minor-credit_minor) filter(where account_code='receivable'),0)::bigint receivable_minor,
      coalesce(sum(credit_minor-debit_minor) filter(where accounting_at >= p_start_at
        and (account_code in ('service_revenue','government_revenue','refund_contra_revenue')
          or (account_code='subscription_revenue' and source_kind='subscription_invoice'))),0)::bigint revenue_minor,
      coalesce(sum(debit_minor-credit_minor) filter(where accounting_at >= p_start_at
        and account_code='expense'),0)::bigint expense_minor
    from scoped group by currency
  )
  select coalesce(pg_catalog.jsonb_object_agg(currency,pg_catalog.jsonb_build_object(
    'cashCollectedMinor',cash_collected_minor,'billedMinor',billed_minor,
    'receivableMinor',receivable_minor,'revenueMinor',revenue_minor,
    'expenseMinor',expense_minor,'profitMinor',revenue_minor-expense_minor
  )),'{}'::jsonb) into v_result from currency_totals;
  return pg_catalog.jsonb_build_object('start',p_start_at,'end',p_end_at,'currencies',v_result);
end;
$$;

create function public.p309_subscription_report(
  p_actor_id uuid,p_start_at timestamptz,p_end_at timestamptz
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform private.p309_assert_report_scope(p_actor_id,null,null);
  if p_start_at is null or p_end_at is null or p_start_at>=p_end_at then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  with active_end as (
    select distinct on (history.subscription_id) history.*
    from public.subscription_status_history history
    where history.status='active' and history.valid_from<p_end_at
      and (history.valid_to is null or history.valid_to>=p_end_at)
    order by history.subscription_id,history.valid_from desc
  ), active_start as (
    select distinct on (history.subscription_id) history.*
    from public.subscription_status_history history
    where history.status='active' and history.valid_from<=p_start_at
      and (history.valid_to is null or history.valid_to>p_start_at)
    order by history.subscription_id,history.valid_from desc
  ), canceled as (
    select distinct history.subscription_id,start_population.currency
    from public.subscription_status_history history
    join active_start start_population on start_population.subscription_id=history.subscription_id
    where history.status='canceled' and history.valid_from>=p_start_at and history.valid_from<p_end_at
      and not exists(select 1 from public.subscription_status_history reactivated
        where reactivated.subscription_id=history.subscription_id and reactivated.status='active'
          and reactivated.valid_from>history.valid_from and reactivated.valid_from<p_end_at)
  ), currency_metrics as (
    select active.currency,count(*)::bigint active_count,
      (12*coalesce(sum(active.amount_minor) filter(where active.interval='month'),0)
        +coalesce(sum(active.amount_minor) filter(where active.interval='year'),0))::bigint numerator
    from active_end active group by active.currency
  ), population as (
    select start_population.currency,count(*)::bigint active_at_start,
      count(canceled.subscription_id)::bigint canceled_count
    from active_start start_population left join canceled
      on canceled.subscription_id=start_population.subscription_id
    group by start_population.currency
  ), currencies as (
    select currency from currency_metrics union select currency from population
  ), combined as (
    select currencies.currency,coalesce(metric.active_count,0)::bigint active_count,
      coalesce(metric.numerator,0)::bigint numerator,
      coalesce(population.active_at_start,0)::bigint active_at_start,
      coalesce(population.canceled_count,0)::bigint canceled_count
    from currencies left join currency_metrics metric using(currency)
    left join population using(currency)
  )
  select pg_catalog.jsonb_build_object(
    'start',p_start_at,'end',p_end_at,
    'currencies',coalesce((select pg_catalog.jsonb_object_agg(metric.currency,pg_catalog.jsonb_build_object(
      'activePaidCount',metric.active_count,
      'mrrMinor',metric.numerator/12,'mrrAnnualRemainderMinor',metric.numerator%12,
      'arrNumeratorMinor',metric.numerator,
      'churnRate',case when metric.active_at_start=0 then null else pg_catalog.jsonb_build_object(
        'numerator',metric.canceled_count,'denominator',metric.active_at_start) end,
      'arpuMinor',case when metric.active_count=0 then null else metric.numerator/(12*metric.active_count) end,
      'arpuRemainder',case when metric.active_count=0 then 0 else metric.numerator%(12*metric.active_count) end,
      'arpuDenominator',12*metric.active_count
    )) from combined metric),'{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create function public.p309_export_finance_page(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_start_at timestamptz,p_end_at timestamptz,
  p_operation_id uuid,
  p_currency text default null,p_kind text default null,p_before_accounting_at timestamptz default null,
  p_before_id uuid default null,p_limit integer default 1000
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_rows jsonb;v_next jsonb;v_allowance record;v_allowance_source uuid;
  v_limit integer:=least(1000,greatest(1,coalesce(p_limit,1000)));
begin
  perform private.p309_assert_report_scope(p_actor_id,p_tenant_id,p_company_id);
  if p_start_at is null or p_end_at is null or p_start_at>=p_end_at
    or (p_tenant_id is not null and p_operation_id is null)
    or (p_before_accounting_at is null)<>(p_before_id is null)
    or (p_currency is not null and p_currency!~'^[A-Z]{3}$')
    or (p_kind is not null and p_kind not in ('invoice','payment','refund','credit_note','expense','compensation'))
  then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  if p_tenant_id is not null then
    v_allowance_source:=private.p309_event_uuid('finance-export:'||pg_catalog.jsonb_build_array(
      p_actor_id,p_tenant_id,p_company_id,p_start_at,p_end_at,p_currency,p_kind
    )::text);
    select * into v_allowance from public.p309_consume_plan_allowance(
      p_tenant_id,p_operation_id,'finance_exports',1,'finance_export',v_allowance_source
    );
    if v_allowance.status <> 'allowed' then
      raise exception 'PLAN_ALLOWANCE_%',upper(v_allowance.status) using errcode='P3098';
    end if;
  end if;
  with export_rows as (
    select journal.id,journal.accounting_at,
      case when journal.source_kind in ('invoice','subscription_invoice','invoice_void') then 'invoice'
        when journal.source_kind='payment_allocation' then 'payment'
        when journal.source_kind='cash_refund' then 'refund'
        when journal.source_kind='credit_note' then 'credit_note'
        when journal.source_kind in ('expense','expense_reversal') then 'expense'
        else 'compensation' end kind,
      case when journal.source_kind='payment_allocation' then allocation.payment_id else journal.source_id end::text reference,
      journal.currency,
      case when journal.source_kind in ('invoice','subscription_invoice','invoice_void','credit_note')
          then sum(entry.debit_minor-entry.credit_minor) filter(where entry.account_code='receivable')
        when journal.source_kind in ('payment_allocation','cash_refund')
          then sum(entry.debit_minor-entry.credit_minor) filter(where entry.account_code in ('cash_clearing','bank_clearing'))
        else sum(entry.debit_minor-entry.credit_minor) filter(where entry.account_code='expense') end::bigint amount_minor
    from public.finance_journals journal join public.finance_journal_entries entry on entry.journal_id=journal.id
    left join public.payment_allocations allocation on allocation.id=journal.source_id
      and journal.source_kind='payment_allocation'
    where journal.state = 'posted' and journal.accounting_at >= p_start_at and journal.accounting_at < p_end_at
      and (p_tenant_id is null or journal.tenant_id=p_tenant_id)
      and (p_company_id is null or journal.company_id=p_company_id)
      and (p_currency is null or journal.currency=p_currency)
      and (p_before_accounting_at is null or (journal.accounting_at,journal.id)<(p_before_accounting_at,p_before_id))
    group by journal.id,allocation.payment_id
  ), filtered as (
    select * from export_rows where p_kind is null or kind=p_kind
    order by accounting_at desc,id desc limit v_limit
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'occurredAt',accounting_at,'kind',kind,'reference',reference,
    'amountMinor',amount_minor,'currency',currency
  ) order by accounting_at desc,id desc),'[]'::jsonb),
  (select pg_catalog.jsonb_build_object('occurredAt',accounting_at,'id',id) from filtered
    order by accounting_at asc,id asc limit 1)
  into v_rows,v_next from filtered;
  return pg_catalog.jsonb_build_object('rows',v_rows,'nextCursor',case when pg_catalog.jsonb_array_length(v_rows)=v_limit then v_next else null end);
end;
$$;

create function public.p309_generate_finance_receipt(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_actor_role text,p_invoice_id uuid,
  p_receipt_kind text,p_receipt_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;v_operation_receipt_id uuid;v_snapshot jsonb;
begin
  if p_actor_role not in ('customer','pro','admin','super_admin')
    or p_receipt_kind not in ('invoice','payment','refund') then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  select * into v_invoice from public.invoices invoice where invoice.id=p_invoice_id
    and invoice.tenant_id=p_tenant_id and invoice.company_id=p_company_id;
  if not found then raise exception using errcode='P0002',message='NOT_FOUND'; end if;
  if p_actor_role='customer' then
    if v_invoice.customer_profile_id is distinct from p_actor_id or not exists(
      select 1 from public.profiles profile join public.customer_profiles customer
        on customer.profile_id=profile.id and customer.linked_company_id=p_company_id
      where profile.id=p_actor_id and profile.tenant_id=p_tenant_id
        and profile.role='customer' and profile.status='active'
    ) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  elsif p_actor_role='pro' and not exists(
    select 1 from public.profiles profile join public.pro_company_assignments assignment
      on assignment.pro_profile_id=profile.id
    where profile.id=p_actor_id and profile.role='pro' and profile.status='active'
      and profile.tenant_id=p_tenant_id
      and assignment.tenant_id=p_tenant_id and assignment.company_id=p_company_id and assignment.status='active'
  ) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if p_actor_role in ('admin','super_admin') and not exists(
    select 1 from public.profiles profile where profile.id=p_actor_id and profile.role::text=p_actor_role
      and profile.status='active' and profile.tenant_id is null
  ) then raise exception using errcode='42501',message='FORBIDDEN'; end if;

  select receipt.id,snapshot.snapshot into v_operation_receipt_id,v_snapshot
  from public.finance_receipt_snapshots snapshot
  join public.finance_operation_receipts receipt on receipt.id=snapshot.operation_receipt_id
    and receipt.tenant_id=snapshot.tenant_id and receipt.company_id=snapshot.company_id
  where snapshot.tenant_id=p_tenant_id and snapshot.company_id=p_company_id
    and snapshot.invoice_id=p_invoice_id and snapshot.receipt_kind=p_receipt_kind
    and snapshot.receipt_id=p_receipt_id and receipt.aggregate_kind = p_receipt_kind
    and receipt.aggregate_id = p_receipt_id;
  if not found then
    raise exception using errcode='P0002',message='NOT_FOUND';
  end if;

  insert into public.finance_audit_log(tenant_id,company_id,actor_id,operation_receipt_id,action,resource_kind,resource_id,details)
  values
    (p_tenant_id,p_company_id,p_actor_id,v_operation_receipt_id,'finance.receipt_accessed',p_receipt_kind,p_receipt_id,
      pg_catalog.jsonb_build_object('invoice_id',p_invoice_id)),
    (p_tenant_id,p_company_id,p_actor_id,v_operation_receipt_id,'finance.receipt_generated',p_receipt_kind,p_receipt_id,
      pg_catalog.jsonb_build_object('invoice_id',p_invoice_id));
  return v_snapshot;
end;
$$;

revoke all on function public.p309_finance_report(uuid,uuid,uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.p309_finance_report(uuid,uuid,uuid,uuid,timestamptz,timestamptz) to service_role;
revoke all on function public.p309_subscription_report(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.p309_subscription_report(uuid,timestamptz,timestamptz) to service_role;
revoke all on function public.p309_export_finance_page(uuid,uuid,uuid,timestamptz,timestamptz,uuid,text,text,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.p309_export_finance_page(uuid,uuid,uuid,timestamptz,timestamptz,uuid,text,text,timestamptz,uuid,integer) to service_role;
revoke all on function public.p309_generate_finance_receipt(uuid,uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.p309_generate_finance_receipt(uuid,uuid,uuid,text,uuid,text,uuid) to service_role;
revoke all on function private.p309_assert_report_scope(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.p309_capture_subscription_status() from public,anon,authenticated,service_role;

commit;
