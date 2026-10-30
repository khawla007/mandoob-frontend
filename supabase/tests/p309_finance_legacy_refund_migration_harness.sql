\set ON_ERROR_STOP on
\if :{?p309_disposable_database}
\else
  \set ON_ERROR_STOP on
  \echo 'Set -v p309_disposable_database=1 and run only on a disposable pre-P3.09 database.'
  select 1 / 0 as disposable_database_flag_required;
\endif

insert into public.tenants (id, slug, name, status) values
  ('93910000-0000-4000-8000-000000000010', 'p309-refund-harness', 'P309 refund harness', 'active');
insert into public.company_profiles (id, tenant_id, company_name) values
  ('93910000-0000-4000-8000-000000000020', '93910000-0000-4000-8000-000000000010', 'P309 harness company');
insert into public.invoices (id, tenant_id, company_id, label, amount_minor, currency, status) values
  ('93910000-0000-4000-8000-000000000030', '93910000-0000-4000-8000-000000000010',
   '93910000-0000-4000-8000-000000000020', 'Valid refund chain', 100, 'AED', 'open'),
  ('93910000-0000-4000-8000-000000000031', '93910000-0000-4000-8000-000000000010',
   '93910000-0000-4000-8000-000000000020', 'Mismatched refund chain', 100, 'AED', 'open');
insert into public.payments (id, tenant_id, invoice_id, provider, amount_minor, currency, method, status) values
  ('93910000-0000-4000-8000-000000000040', '93910000-0000-4000-8000-000000000010',
   '93910000-0000-4000-8000-000000000030', 'manual', 100, 'AED', 'cash', 'succeeded'),
  ('93910000-0000-4000-8000-000000000041', '93910000-0000-4000-8000-000000000010',
   '93910000-0000-4000-8000-000000000031', 'manual', 100, 'USD', 'cash', 'succeeded');
insert into public.refunds (id, tenant_id, payment_id, amount_minor, status) values
  ('93910000-0000-4000-8000-000000000050', '93910000-0000-4000-8000-000000000010',
   '93910000-0000-4000-8000-000000000040', 10, 'succeeded'),
  ('93910000-0000-4000-8000-000000000051', '93910000-0000-4000-8000-000000000010',
   '93910000-0000-4000-8000-000000000041', 10, 'succeeded');

\ir ../migrations/20260922090000_p309_finance_ledger.sql

do $p309_legacy_refund_harness$
begin
  if not exists (
    select 1 from public.refunds
    where id = '93910000-0000-4000-8000-000000000050'
      and currency = 'AED' and ledger_eligible and quarantine_reason is null
  ) then raise exception 'VALID_LEGACY_REFUND_NOT_CLASSIFIED'; end if;
  if not exists (
    select 1 from public.refunds
    where id = '93910000-0000-4000-8000-000000000051'
      and currency is null and not ledger_eligible
      and quarantine_reason = 'legacy_currency_mismatch'
  ) then raise exception 'INVALID_LEGACY_REFUND_NOT_QUARANTINED'; end if;
end;
$p309_legacy_refund_harness$;

delete from public.refunds where tenant_id = '93910000-0000-4000-8000-000000000010';
delete from public.payments where tenant_id = '93910000-0000-4000-8000-000000000010';
delete from public.invoices where tenant_id = '93910000-0000-4000-8000-000000000010';
delete from public.company_profiles where tenant_id = '93910000-0000-4000-8000-000000000010';
delete from public.tenants where id = '93910000-0000-4000-8000-000000000010';
