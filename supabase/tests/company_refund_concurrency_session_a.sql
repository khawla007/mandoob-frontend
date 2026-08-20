-- Start session B while this session sleeps with invoice and payment locked.
\set ON_ERROR_STOP on

delete from public.tenants
where id = '64100000-0000-4000-8000-000000000001';

insert into public.tenants (id, slug, name, status)
values (
  '64100000-0000-4000-8000-000000000001',
  'refund-concurrency-fixture',
  'Refund concurrency fixture',
  'active'
);
insert into public.company_profiles (id, tenant_id, company_name, status)
values (
  '64100000-0000-4000-8000-000000000002',
  '64100000-0000-4000-8000-000000000001',
  'Refund concurrency company',
  'active'
);
insert into public.invoices (
  id, tenant_id, company_id, label, amount_minor, currency, status
) values (
  '64100000-0000-4000-8000-000000000003',
  '64100000-0000-4000-8000-000000000001',
  '64100000-0000-4000-8000-000000000002',
  'Refund concurrency invoice',
  1000,
  'AED',
  'paid'
);
insert into public.payments (
  id, tenant_id, invoice_id, provider, provider_charge_id,
  amount_minor, currency, method, status
) values (
  '64100000-0000-4000-8000-000000000004',
  '64100000-0000-4000-8000-000000000001',
  '64100000-0000-4000-8000-000000000003',
  'tap',
  'chg_refund_concurrency_fixture',
  1000,
  'AED',
  'card',
  'succeeded'
);
insert into public.refunds (
  id, tenant_id, payment_id, amount_minor, reason, status,
  idempotency_key, provider_idempotency_key
) values (
  '64100000-0000-4000-8000-000000000005',
  '64100000-0000-4000-8000-000000000001',
  '64100000-0000-4000-8000-000000000004',
  400,
  'fixture concurrent refund',
  'pending',
  'refund-concurrency-valid',
  'mandoob-refund-concurrency-fixture'
);

\set ON_ERROR_STOP off
begin;
set local lock_timeout = '8s';
set local statement_timeout = '20s';

select 1 from public.invoices
where id = '64100000-0000-4000-8000-000000000003'
for update;
select 1 from public.payments
where id = '64100000-0000-4000-8000-000000000004'
for update;
select pg_sleep(3);

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
