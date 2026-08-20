-- Session B waits for A's explicit readiness signal, then reconcile blocks on
-- the invoice. A observes that lock wait before invoking prepare.
\set ON_ERROR_STOP on
set application_name = 'mandoob_refund_fixture_b';

do $$
declare
  v_deadline timestamptz := clock_timestamp() + interval '10 seconds';
  v_acquired boolean;
begin
  loop
    v_acquired := pg_catalog.pg_try_advisory_lock(6410064);
    if not v_acquired then
      exit;
    end if;
    perform pg_catalog.pg_advisory_unlock(6410064);
    if clock_timestamp() >= v_deadline then
      raise exception using
        errcode = '57014',
        message = 'REFUND_FIXTURE_A_DID_NOT_SIGNAL_READY';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end;
$$;

begin;
set local lock_timeout = '8s';
set local statement_timeout = '20s';
\set ON_ERROR_STOP off
select * from public.reconcile_company_refund(
  '64100000-0000-4000-8000-000000000001',
  '64100000-0000-4000-8000-000000000002',
  '64100000-0000-4000-8000-000000000005',
  null,
  're_refund_concurrency_fixture',
  'succeeded',
  '127.0.0.1'
);
\set refund_sqlstate :SQLSTATE
commit;

\set ON_ERROR_STOP on
select pg_catalog.set_config('mandoob.refund_fixture_sqlstate', :'refund_sqlstate', false);
do $$
declare
  v_state text := current_setting('mandoob.refund_fixture_sqlstate');
  v_ledger_consistent boolean;
  v_refund_audited boolean;
begin
  if v_state in ('40P01', '55P03', '57014') then
    raise exception using message = 'SESSION_B_CONCURRENCY_SQLSTATE_' || v_state;
  end if;
  if v_state <> '00000' then
    raise exception using message = 'SESSION_B_UNEXPECTED_SQLSTATE_' || v_state;
  end if;

  select i.status = 'partially_refunded'
      and p.status = 'partially_refunded'
      and r.status = 'succeeded'
      and r.provider_refund_id = 're_refund_concurrency_fixture'
    into v_ledger_consistent
  from public.invoices i
  join public.payments p on p.invoice_id = i.id and p.tenant_id = i.tenant_id
  join public.refunds r on r.payment_id = p.id and r.tenant_id = p.tenant_id
  where i.id = '64100000-0000-4000-8000-000000000003'
    and r.id = '64100000-0000-4000-8000-000000000005';

  select count(*) = 1 into v_refund_audited
  from public.tenant_audit_log audit
  where audit.tenant_id = '64100000-0000-4000-8000-000000000001'
    and audit.action = 'refund_issued'
    and audit.details ->> 'refund_id' = '64100000-0000-4000-8000-000000000005';

  if v_ledger_consistent is distinct from true then
    raise exception using message = 'REFUND_CONCURRENCY_LEDGER_POSTCONDITION_FAILED';
  end if;
  if v_refund_audited is distinct from true then
    raise exception using message = 'REFUND_CONCURRENCY_AUDIT_POSTCONDITION_FAILED';
  end if;
end;
$$;

delete from public.tenants
where id = '64100000-0000-4000-8000-000000000001';
