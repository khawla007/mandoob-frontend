-- Session A establishes the conflict shape: hold invoice/payment, publish a
-- readiness advisory lock, wait until session B is blocked on the invoice, then
-- invoke prepare. With the canonical order, B has not locked the refund yet.
\set ON_ERROR_STOP on
set application_name = 'mandoob_refund_fixture_a';
begin;
set local lock_timeout = '8s';
set local statement_timeout = '20s';

select 1 from public.invoices
where id = '64100000-0000-4000-8000-000000000003'
for update;
select 1 from public.payments
where id = '64100000-0000-4000-8000-000000000004'
for update;
select pg_advisory_lock(6410064);

do $$
declare
  v_deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    exit when exists (
      select 1
      from pg_catalog.pg_stat_activity activity
      where activity.application_name = 'mandoob_refund_fixture_b'
        and activity.state = 'active'
        and activity.wait_event_type = 'Lock'
    );
    if clock_timestamp() >= v_deadline then
      raise exception using
        errcode = '57014',
        message = 'REFUND_FIXTURE_B_DID_NOT_REACH_INVOICE_LOCK_WAIT';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end;
$$;

\set ON_ERROR_STOP off
select * from public.prepare_company_refund(
  '64100000-0000-4000-8000-000000000001',
  '64100000-0000-4000-8000-000000000002',
  '64100000-0000-4000-8000-000000000003',
  '64100000-0000-4000-8000-000000000099',
  400,
  'fixture concurrent refund',
  'refund-concurrency-valid'
);
\set refund_sqlstate :SQLSTATE
commit;

\set ON_ERROR_STOP on
select pg_advisory_unlock(6410064);
select pg_catalog.set_config('mandoob.refund_fixture_sqlstate', :'refund_sqlstate', false);
do $$
declare
  v_state text := current_setting('mandoob.refund_fixture_sqlstate');
begin
  if v_state in ('40P01', '55P03', '57014') then
    raise exception using message = 'SESSION_A_CONCURRENCY_SQLSTATE_' || v_state;
  end if;
  if v_state <> '00000' then
    raise exception using message = 'SESSION_A_UNEXPECTED_SQLSTATE_' || v_state;
  end if;
end;
$$;
