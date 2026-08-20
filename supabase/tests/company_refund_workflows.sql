-- Run after a clean local migration reset. This fixture is transactional and
-- validates refund input errors plus one successful partial-refund lifecycle.
\set ON_ERROR_STOP on

begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

insert into public.tenants (id, slug, name, status)
values (
  '64000000-0000-4000-8000-000000000001',
  'refund-workflow-fixture',
  'Refund workflow fixture',
  'active'
);

insert into public.company_profiles (id, tenant_id, company_name, status)
values (
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000001',
  'Refund workflow company',
  'active'
);

insert into public.invoices (
  id, tenant_id, company_id, label, amount_minor, currency, status
) values (
  '64000000-0000-4000-8000-000000000003',
  '64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000002',
  'Refund workflow invoice',
  1000,
  'AED',
  'paid'
);

insert into public.payments (
  id, tenant_id, invoice_id, provider, provider_charge_id,
  amount_minor, currency, method, status
) values (
  '64000000-0000-4000-8000-000000000004',
  '64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000003',
  'tap',
  'chg_refund_workflow_fixture',
  1000,
  'AED',
  'card',
  'succeeded'
);

do $$
begin
  begin
    perform * from public.prepare_company_refund(
      '64000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000002',
      '64000000-0000-4000-8000-000000000003',
      '64000000-0000-4000-8000-000000000099',
      null,
      'null amount',
      'refund-null-amount'
    );
    raise exception using message = 'EXPECTED_NULL_AMOUNT_MD400';
  exception when sqlstate 'MD400' then
    if sqlerrm <> 'invalid_refund_intent' then
      raise exception using message = 'UNSTABLE_NULL_AMOUNT_ERROR';
    end if;
  end;

  begin
    perform * from public.prepare_company_refund(
      '64000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000002',
      '64000000-0000-4000-8000-000000000003',
      '64000000-0000-4000-8000-000000000099',
      100,
      'null key',
      null
    );
    raise exception using message = 'EXPECTED_NULL_KEY_MD400';
  exception when sqlstate 'MD400' then
    if sqlerrm <> 'invalid_refund_intent' then
      raise exception using message = 'UNSTABLE_NULL_KEY_ERROR';
    end if;
  end;

  begin
    perform * from public.prepare_company_refund(
      '64000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000002',
      '64000000-0000-4000-8000-000000000003',
      '64000000-0000-4000-8000-000000000099',
      100,
      'blank key',
      '   '
    );
    raise exception using message = 'EXPECTED_BLANK_KEY_MD400';
  exception when sqlstate 'MD400' then
    if sqlerrm <> 'invalid_refund_intent' then
      raise exception using message = 'UNSTABLE_BLANK_KEY_ERROR';
    end if;
  end;

  begin
    perform * from public.reconcile_company_refund(
      '64000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000002',
      '64000000-0000-4000-8000-000000000098',
      null,
      null,
      null,
      null
    );
    raise exception using message = 'EXPECTED_NULL_STATUS_MD400';
  exception when sqlstate 'MD400' then
    if sqlerrm <> 'invalid_refund_status' then
      raise exception using message = 'UNSTABLE_NULL_STATUS_ERROR';
    end if;
  end;

  begin
    perform * from public.prepare_company_refund(
      '64000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000002',
      '64000000-0000-4000-8000-000000000098',
      '64000000-0000-4000-8000-000000000099',
      100,
      'missing invoice',
      'refund-missing-invoice'
    );
    raise exception using message = 'EXPECTED_PREPARE_MD404';
  exception when sqlstate 'MD404' then
    if sqlerrm <> 'owned_refundable_invoice_not_found' then
      raise exception using message = 'UNSTABLE_PREPARE_MISSING_ERROR';
    end if;
  end;

  begin
    perform * from public.reconcile_company_refund(
      '64000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000002',
      '64000000-0000-4000-8000-000000000098',
      null,
      null,
      'succeeded',
      null
    );
    raise exception using message = 'EXPECTED_RECONCILE_MD404';
  exception when sqlstate 'MD404' then
    if sqlerrm <> 'owned_refund_intent_not_found' then
      raise exception using message = 'UNSTABLE_RECONCILE_MISSING_ERROR';
    end if;
  end;
end;
$$;

select * from public.prepare_company_refund(
  '64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000003',
  '64000000-0000-4000-8000-000000000099',
  400,
  'fixture partial refund',
  'refund-workflow-valid'
) \gset prepared_

select :'prepared_refund_status' = 'pending' as prepared_pending,
  :'prepared_payment_id'::uuid = '64000000-0000-4000-8000-000000000004'::uuid
    as prepared_owned_payment \gset
\if :prepared_pending
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
\if :prepared_owned_payment
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

select * from public.reconcile_company_refund(
  '64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000002',
  :'prepared_refund_id'::uuid,
  null,
  're_workflow_fixture',
  'succeeded',
  '127.0.0.1'
) \gset reconciled_

select :'reconciled_refund_status' = 'succeeded' as reconciled_succeeded,
  :'reconciled_partial'::boolean as reconciled_partial,
  (
    select i.status = 'partially_refunded'
      and p.status = 'partially_refunded'
      and r.status = 'succeeded'
      and r.provider_refund_id = 're_workflow_fixture'
    from public.invoices i
    join public.payments p on p.invoice_id = i.id and p.tenant_id = i.tenant_id
    join public.refunds r on r.payment_id = p.id and r.tenant_id = p.tenant_id
    where i.id = '64000000-0000-4000-8000-000000000003'
      and r.id = :'prepared_refund_id'::uuid
  ) as ledger_partially_refunded,
  (
    select count(*) = 1
    from public.tenant_audit_log
    where tenant_id = '64000000-0000-4000-8000-000000000001'
      and action = 'refund_issued'
      and details ->> 'refund_id' = :'prepared_refund_id'
  ) as refund_audited \gset
\if :reconciled_succeeded
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
\if :reconciled_partial
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
\if :ledger_partially_refunded
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
\if :refund_audited
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

rollback;
