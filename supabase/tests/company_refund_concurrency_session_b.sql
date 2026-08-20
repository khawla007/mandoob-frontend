-- Start concurrently with session A. Reconcile must wait on the invoice before
-- touching payment/refund and complete without deadlock or timeout.
\set ON_ERROR_STOP off
select pg_sleep(1);

begin;
set local lock_timeout = '8s';
set local statement_timeout = '20s';
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

select :'refund_sqlstate' = '00000' as expected_refund_state,
  :'refund_sqlstate' not in ('40P01', '55P03', '57014') as no_concurrency_failure \gset
\if :no_concurrency_failure
\else
  \quit 1
\endif
\if :expected_refund_state
\else
  \quit 1
\endif

select i.status = 'partially_refunded'
    and p.status = 'partially_refunded'
    and r.status = 'succeeded'
    and r.provider_refund_id = 're_refund_concurrency_fixture'
    as ledger_consistent,
  (
    select count(*) = 1
    from public.tenant_audit_log audit
    where audit.tenant_id = '64100000-0000-4000-8000-000000000001'
      and audit.action = 'refund_issued'
      and audit.details ->> 'refund_id' = '64100000-0000-4000-8000-000000000005'
  ) as refund_audited
from public.invoices i
join public.payments p on p.invoice_id = i.id and p.tenant_id = i.tenant_id
join public.refunds r on r.payment_id = p.id and r.tenant_id = p.tenant_id
where i.id = '64100000-0000-4000-8000-000000000003'
  and r.id = '64100000-0000-4000-8000-000000000005' \gset
\if :ledger_consistent
\else
  \quit 1
\endif
\if :refund_audited
\else
  \quit 1
\endif

\set ON_ERROR_STOP on
delete from public.tenants
where id = '64100000-0000-4000-8000-000000000001';
