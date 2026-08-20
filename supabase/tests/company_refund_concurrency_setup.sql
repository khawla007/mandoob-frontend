-- Run once before launching concurrency sessions A and B. The fixture is fully
-- committed before either racing transaction starts.
\set ON_ERROR_STOP on

begin;
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
commit;
