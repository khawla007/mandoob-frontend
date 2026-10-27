-- P3.09 finance ledger foundation.
-- Commands are added by 20260922091000; this migration owns only durable
-- records, arithmetic, posting primitives, and least-privilege boundaries.
begin;

create table public.finance_currencies (
  code text primary key check (code ~ '^[A-Z]{3}$')
);
insert into public.finance_currencies (code) values
  ('AED'),('AFN'),('ALL'),('AMD'),('ANG'),('AOA'),('ARS'),('AUD'),('AWG'),('AZN'),
  ('BAM'),('BBD'),('BDT'),('BGN'),('BHD'),('BIF'),('BMD'),('BND'),('BOB'),('BOV'),
  ('BRL'),('BSD'),('BTN'),('BWP'),('BYN'),('BZD'),('CAD'),('CDF'),('CHE'),('CHF'),
  ('CHW'),('CLF'),('CLP'),('CNY'),('COP'),('COU'),('CRC'),('CUP'),('CVE'),('CZK'),
  ('DJF'),('DKK'),('DOP'),('DZD'),('EGP'),('ERN'),('ETB'),('EUR'),('FJD'),('FKP'),
  ('GBP'),('GEL'),('GHS'),('GIP'),('GMD'),('GNF'),('GTQ'),('GYD'),('HKD'),('HNL'),
  ('HTG'),('HUF'),('IDR'),('ILS'),('INR'),('IQD'),('IRR'),('ISK'),('JMD'),('JOD'),
  ('JPY'),('KES'),('KGS'),('KHR'),('KMF'),('KPW'),('KRW'),('KWD'),('KYD'),('KZT'),
  ('LAK'),('LBP'),('LKR'),('LRD'),('LSL'),('LYD'),('MAD'),('MDL'),('MGA'),('MKD'),
  ('MMK'),('MNT'),('MOP'),('MRU'),('MUR'),('MVR'),('MWK'),('MXN'),('MXV'),('MYR'),
  ('MZN'),('NAD'),('NGN'),('NIO'),('NOK'),('NPR'),('NZD'),('OMR'),('PAB'),('PEN'),
  ('PGK'),('PHP'),('PKR'),('PLN'),('PYG'),('QAR'),('RON'),('RSD'),('RUB'),('RWF'),
  ('SAR'),('SBD'),('SCR'),('SDG'),('SEK'),('SGD'),('SHP'),('SLE'),('SOS'),('SRD'),
  ('SSP'),('STN'),('SVC'),('SYP'),('SZL'),('THB'),('TJS'),('TMT'),('TND'),('TOP'),
  ('TRY'),('TTD'),('TWD'),('TZS'),('UAH'),('UGX'),('USD'),('USN'),('UYI'),('UYU'),
  ('UYW'),('UZS'),('VED'),('VES'),('VND'),('VUV'),('WST'),('XAF'),('XAG'),('XAU'),
  ('XBA'),('XBB'),('XBC'),('XBD'),('XCD'),('XCG'),('XDR'),('XOF'),('XPD'),('XPF'),
  ('XPT'),('XSU'),('XTS'),('XUA'),('XXX'),('YER'),('ZAR'),('ZMW'),('ZWG');

alter table public.refunds
  add column currency text,
  add column ledger_eligible boolean not null default false,
  add column quarantine_reason text not null default 'legacy_pending_validation';

update public.refunds refund
set quarantine_reason = 'legacy_missing_payment'
where not exists (
  select 1 from public.payments payment
  where payment.id = refund.payment_id and payment.tenant_id = refund.tenant_id
);
update public.refunds refund
set quarantine_reason = 'legacy_missing_invoice'
from public.payments payment
where payment.id = refund.payment_id and payment.tenant_id = refund.tenant_id
  and not exists (
    select 1 from public.invoices invoice
    where invoice.id = payment.invoice_id and invoice.tenant_id = payment.tenant_id
  );
update public.refunds refund
set quarantine_reason = 'legacy_currency_mismatch'
from public.payments payment, public.invoices invoice
where payment.id = refund.payment_id and payment.tenant_id = refund.tenant_id
  and invoice.id = payment.invoice_id and invoice.tenant_id = payment.tenant_id
  and payment.currency is distinct from invoice.currency;
update public.refunds refund
set quarantine_reason = 'legacy_currency_unsupported'
from public.payments payment, public.invoices invoice
where payment.id = refund.payment_id and payment.tenant_id = refund.tenant_id
  and invoice.id = payment.invoice_id and invoice.tenant_id = payment.tenant_id
  and payment.currency = invoice.currency
  and not exists (
    select 1 from public.finance_currencies currency where currency.code = payment.currency
  );
alter table public.refunds alter column quarantine_reason drop not null;
update public.refunds refund
set currency = payment.currency, ledger_eligible = true, quarantine_reason = null
from public.payments payment, public.invoices invoice
where payment.id = refund.payment_id
  and payment.tenant_id = refund.tenant_id
  and invoice.id = payment.invoice_id
  and invoice.tenant_id = payment.tenant_id
  and payment.currency = invoice.currency
  and exists (
    select 1 from public.finance_currencies currency where currency.code = payment.currency
  );
alter table public.refunds
  add constraint refunds_currency_fk foreign key (currency) references public.finance_currencies (code),
  add constraint refunds_p309_eligibility_shape check (
    (ledger_eligible and currency is not null and quarantine_reason is null)
    or (not ledger_eligible and quarantine_reason is not null)
  ) not valid;

do $p309_required_ownership$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'invoices_customer_company_fk'
      and conrelid = 'public.invoices'::regclass
  ) then
    raise exception using errcode = 'P0001', message = 'P309_CUSTOMER_OWNERSHIP_PREREQUISITE_MISSING';
  end if;
end;
$p309_required_ownership$;

alter table public.invoices
  add column ledger_eligible boolean not null default false,
  add column version bigint not null default 0,
  add column finalized_at timestamptz,
  add column voided_at timestamptz,
  add constraint invoices_p309_version_positive check (version >= 0),
  add constraint invoices_p309_money_shape check (
    ledger_eligible is false
    or (amount_minor between 0 and 100000000000 and currency ~ '^[A-Z]{3}$')
  ) not valid,
  add constraint invoices_p309_lifecycle_shape check (
    ledger_eligible is false
    or (status = 'draft' and finalized_at is null and voided_at is null)
    or (
      status in ('open', 'paid', 'refunded', 'partially_refunded')
      and finalized_at is not null and voided_at is null
    )
    or (status = 'void' and finalized_at is not null and voided_at is not null)
  ) not valid;

-- Existing rows predate immutable line and journal snapshots. Preserve them,
-- but never allow them to be recognized by a P3.09 posting command.
update public.invoices set ledger_eligible = false;

create unique index invoices_tenant_company_id_key
  on public.invoices (tenant_id, company_id, id);
create unique index payments_tenant_invoice_id_key
  on public.payments (tenant_id, invoice_id, id);
create unique index refunds_tenant_payment_id_key
  on public.refunds (tenant_id, payment_id, id);

create table public.finance_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  aggregate_kind text not null check (
    aggregate_kind in ('invoice', 'payment', 'refund', 'credit_note', 'expense', 'compensation')
  ),
  aggregate_id uuid not null,
  expected_version bigint not null check (expected_version >= 0),
  committed_version bigint not null check (committed_version > expected_version),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  sanitized_result jsonb not null check (pg_catalog.jsonb_typeof(sanitized_result) = 'object'),
  committed_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_id, operation_id),
  unique (tenant_id, company_id, id),
  constraint finance_operation_receipts_company_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete restrict
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  invoice_id uuid not null,
  line_number integer not null check (line_number > 0),
  description text not null check (pg_catalog.char_length(pg_catalog.btrim(description)) between 1 and 500),
  quantity bigint not null check (quantity between 1 and 1000000),
  unit_amount_minor bigint not null check (unit_amount_minor between 0 and 100000000000),
  discount_minor bigint not null default 0 check (discount_minor between 0 and 100000000000),
  tax_category text not null check (tax_category in ('standard', 'exempt', 'zero_rated')),
  tax_basis text not null check (tax_basis in ('exclusive', 'inclusive', 'exempt', 'zero_rated')),
  vat_basis_points integer not null check (vat_basis_points between 0 and 10000),
  net_minor bigint not null check (net_minor between 0 and 100000000000),
  vat_minor bigint not null check (vat_minor between 0 and 100000000000),
  total_minor bigint not null check (total_minor between 0 and 100000000000),
  currency text not null references public.finance_currencies (code),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tenant_id, company_id, invoice_id, line_number),
  unique (tenant_id, company_id, invoice_id, id),
  constraint invoice_lines_invoice_fk
    foreign key (tenant_id, company_id, invoice_id)
    references public.invoices (tenant_id, company_id, id)
    on delete restrict,
  constraint invoice_lines_amount_shape check (
    discount_minor <= (quantity::numeric * unit_amount_minor::numeric)
    and total_minor = net_minor + vat_minor
  ),
  constraint invoice_lines_tax_shape check (
    (tax_category = 'standard' and tax_basis in ('exclusive', 'inclusive') and vat_basis_points = 500)
    or (tax_category = 'exempt' and tax_basis = 'exempt' and vat_basis_points = 0 and vat_minor = 0)
    or (tax_category = 'zero_rated' and tax_basis = 'zero_rated' and vat_basis_points = 0 and vat_minor = 0)
  )
);

create table public.finance_credit_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  invoice_id uuid not null,
  operation_receipt_id uuid not null,
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  currency text not null references public.finance_currencies (code),
  reason text not null check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 3 and 500),
  issued_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tenant_id, company_id, id),
  constraint finance_credit_notes_invoice_fk
    foreign key (tenant_id, company_id, invoice_id)
    references public.invoices (tenant_id, company_id, id)
    on delete restrict,
  constraint finance_credit_notes_receipt_fk
    foreign key (tenant_id, company_id, operation_receipt_id)
    references public.finance_operation_receipts (tenant_id, company_id, id)
    on delete restrict
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  invoice_id uuid not null,
  payment_id uuid not null,
  operation_receipt_id uuid not null,
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  currency text not null references public.finance_currencies (code),
  allocated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tenant_id, company_id, id),
  unique (tenant_id, company_id, invoice_id, id),
  constraint payment_allocations_invoice_fk
    foreign key (tenant_id, company_id, invoice_id)
    references public.invoices (tenant_id, company_id, id)
    on delete restrict,
  constraint payment_allocations_payment_fk
    foreign key (tenant_id, invoice_id, payment_id)
    references public.payments (tenant_id, invoice_id, id)
    on delete restrict,
  constraint payment_allocations_receipt_fk
    foreign key (tenant_id, company_id, operation_receipt_id)
    references public.finance_operation_receipts (tenant_id, company_id, id)
    on delete restrict
);

create table public.refund_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  invoice_id uuid not null,
  payment_id uuid not null,
  refund_id uuid not null,
  payment_allocation_id uuid not null,
  operation_receipt_id uuid not null,
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  currency text not null references public.finance_currencies (code),
  allocated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tenant_id, company_id, id),
  constraint refund_allocations_invoice_fk
    foreign key (tenant_id, company_id, invoice_id)
    references public.invoices (tenant_id, company_id, id)
    on delete restrict,
  constraint refund_allocations_payment_fk
    foreign key (tenant_id, invoice_id, payment_id)
    references public.payments (tenant_id, invoice_id, id)
    on delete restrict,
  constraint refund_allocations_refund_fk
    foreign key (tenant_id, payment_id, refund_id)
    references public.refunds (tenant_id, payment_id, id)
    on delete restrict,
  constraint refund_allocations_payment_allocation_fk
    foreign key (tenant_id, company_id, invoice_id, payment_allocation_id)
    references public.payment_allocations (tenant_id, company_id, invoice_id, id)
    on delete restrict,
  constraint refund_allocations_receipt_fk
    foreign key (tenant_id, company_id, operation_receipt_id)
    references public.finance_operation_receipts (tenant_id, company_id, id)
    on delete restrict
);

create table public.finance_journals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  operation_receipt_id uuid not null,
  source_kind text not null check (
    source_kind in ('invoice', 'payment_allocation', 'cash_refund', 'credit_note', 'invoice_void', 'expense', 'expense_reversal', 'compensation', 'compensation_reversal', 'subscription_invoice')
  ),
  source_id uuid not null,
  source_category text generated always as (
    case
      when source_kind in ('invoice', 'subscription_invoice') then 'invoice_recognition'
      when source_kind = 'invoice_void' then 'invoice_reversal'
      else source_kind
    end
  ) stored,
  currency text not null references public.finance_currencies (code),
  state text not null default 'draft' check (state in ('draft', 'posted')),
  accounting_at timestamptz not null,
  posted_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (id, currency),
  unique (tenant_id, company_id, id),
  unique (tenant_id, company_id, currency, id),
  constraint finance_journals_company_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete restrict,
  constraint finance_journals_receipt_fk
    foreign key (tenant_id, company_id, operation_receipt_id)
    references public.finance_operation_receipts (tenant_id, company_id, id)
    on delete restrict,
  constraint finance_journals_posting_shape check (
    (state = 'draft' and posted_at is null)
    or (state = 'posted' and posted_at is not null)
  )
);

create unique index finance_journals_one_posted_source
  on public.finance_journals (tenant_id, company_id, source_category, source_id)
  where state = 'posted';

create table public.finance_journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null,
  line_number integer not null check (line_number > 0),
  account_code text not null check (account_code in (
    'receivable', 'cash_clearing', 'bank_clearing', 'subscription_revenue',
    'service_revenue', 'government_revenue', 'vat_payable',
    'refund_contra_revenue', 'expense', 'pro_compensation_payable'
  )),
  debit_minor bigint not null default 0 check (debit_minor between 0 and 100000000000),
  credit_minor bigint not null default 0 check (credit_minor between 0 and 100000000000),
  currency text not null references public.finance_currencies (code),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (journal_id, line_number),
  constraint finance_journal_entries_journal_currency_fk
    foreign key (journal_id, currency)
    references public.finance_journals (id, currency)
    on delete restrict,
  constraint finance_journal_entries_one_side check (
    (debit_minor > 0 and credit_minor = 0)
    or (credit_minor > 0 and debit_minor = 0)
  )
);

create table public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  operation_receipt_id uuid not null,
  source_reference text not null check (pg_catalog.char_length(pg_catalog.btrim(source_reference)) between 1 and 200),
  description text not null check (pg_catalog.char_length(pg_catalog.btrim(description)) between 1 and 500),
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  currency text not null references public.finance_currencies (code),
  state text not null default 'draft' check (state in ('draft', 'approved', 'posted', 'reversed')),
  version bigint not null default 1 check (version >= 1),
  posted_journal_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tenant_id, company_id, id),
  constraint finance_expenses_company_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete restrict,
  constraint finance_expenses_receipt_fk
    foreign key (tenant_id, company_id, operation_receipt_id)
    references public.finance_operation_receipts (tenant_id, company_id, id)
    on delete restrict,
  constraint finance_expenses_posted_journal_fk
    foreign key (tenant_id, company_id, currency, posted_journal_id)
    references public.finance_journals (tenant_id, company_id, currency, id)
    on delete restrict,
  constraint finance_expenses_lifecycle_shape check (
    (state = 'draft' and version = 1 and posted_journal_id is null)
    or (state = 'approved' and version >= 2 and posted_journal_id is null)
    or (state = 'posted' and version >= 3 and posted_journal_id is not null)
    or (state = 'reversed' and version >= 4 and posted_journal_id is not null)
  )
);

create unique index pro_company_assignments_p309_provenance_key
  on public.pro_company_assignments (tenant_id, company_id, pro_profile_id, id, assigned_at);

create table public.pro_compensations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  pro_profile_id uuid not null references public.profiles(id) on delete restrict,
  company_assignment_id uuid not null,
  company_assignment_assigned_at timestamptz not null,
  commercial_term_id uuid not null,
  commercial_term_version bigint not null check (commercial_term_version > 0),
  commercial_term_model public.pro_term_model not null,
  commercial_term_amount_minor bigint not null check (commercial_term_amount_minor between 1 and 100000000000),
  commercial_term_scope text not null,
  commercial_term_effective_from date not null,
  operation_receipt_id uuid not null,
  source_reference text not null check (pg_catalog.char_length(pg_catalog.btrim(source_reference)) between 1 and 200),
  source_reference_normalized text generated always as (pg_catalog.lower(pg_catalog.btrim(source_reference))) stored,
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  currency text not null references public.finance_currencies (code),
  state text not null default 'draft' check (state in ('draft', 'approved', 'posted', 'reversed')),
  version bigint not null default 1 check (version >= 1),
  posted_journal_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tenant_id, company_id, id),
  constraint pro_compensations_company_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete restrict,
  constraint pro_compensations_receipt_fk
    foreign key (tenant_id, company_id, operation_receipt_id)
    references public.finance_operation_receipts (tenant_id, company_id, id)
    on delete restrict,
  constraint pro_compensations_posted_journal_fk
    foreign key (tenant_id, company_id, currency, posted_journal_id)
    references public.finance_journals (tenant_id, company_id, currency, id)
    on delete restrict,
  constraint pro_compensations_commercial_term_fk
    foreign key (pro_profile_id, commercial_term_id)
    references public.pro_commercial_terms (pro_profile_id, id)
    on delete restrict,
  constraint pro_compensations_company_assignment_fk
    foreign key (
      tenant_id, company_id, pro_profile_id, company_assignment_id, company_assignment_assigned_at
    ) references public.pro_company_assignments (
      tenant_id, company_id, pro_profile_id, id, assigned_at
    ) on delete restrict,
  constraint pro_compensations_lifecycle_shape check (
    (state = 'draft' and version = 1 and posted_journal_id is null)
    or (state = 'approved' and version >= 2 and posted_journal_id is null)
    or (state = 'posted' and version >= 3 and posted_journal_id is not null)
    or (state = 'reversed' and version >= 4 and posted_journal_id is not null)
  )
);

create table public.finance_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation_receipt_id uuid not null,
  action text not null check (action ~ '^finance\.[a-z][a-z0-9_]*$'),
  resource_kind text not null,
  resource_id uuid not null,
  details jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint finance_audit_log_company_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete restrict,
  constraint finance_audit_log_receipt_fk
    foreign key (tenant_id, company_id, operation_receipt_id)
    references public.finance_operation_receipts (tenant_id, company_id, id)
    on delete restrict
);

create index invoice_lines_invoice_idx on public.invoice_lines (tenant_id, company_id, invoice_id, line_number);
create index finance_credit_notes_invoice_idx on public.finance_credit_notes (tenant_id, company_id, invoice_id, issued_at, id);
create index payment_allocations_invoice_idx on public.payment_allocations (tenant_id, company_id, invoice_id, allocated_at, id);
create index payment_allocations_payment_idx on public.payment_allocations (tenant_id, payment_id, allocated_at, id);
create index refund_allocations_payment_idx on public.refund_allocations (tenant_id, payment_id, allocated_at, id);
create index finance_journals_company_time_idx on public.finance_journals (tenant_id, company_id, accounting_at, id);
create index finance_journal_entries_account_idx on public.finance_journal_entries (account_code, journal_id);
create index finance_expenses_company_time_idx on public.finance_expenses (tenant_id, company_id, created_at, id);
create index pro_compensations_company_time_idx on public.pro_compensations (tenant_id, company_id, created_at, id);
create index pro_compensations_pro_idx on public.pro_compensations (pro_profile_id, created_at, id);
create unique index pro_compensations_source_unique on public.pro_compensations (
  tenant_id, company_id, pro_profile_id, company_assignment_id, commercial_term_id, source_reference_normalized
);
create index finance_audit_log_resource_idx on public.finance_audit_log (tenant_id, company_id, resource_kind, resource_id, created_at, id);

create function private.p309_checked_money(p_amount_minor bigint, p_currency text)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_amount_minor is null
    or p_amount_minor < -100000000000
    or p_amount_minor > 100000000000
  then
    raise exception using errcode = '22003', message = 'MONEY_AMOUNT_OUT_OF_RANGE';
  end if;
  if not exists (
    select 1 from public.finance_currencies currency where currency.code = p_currency
  ) then
    raise exception using errcode = '22023', message = 'CURRENCY_INVALID';
  end if;
  return p_amount_minor;
end;
$$;

create function private.p309_replay_receipt(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.finance_operation_receipts%rowtype;
begin
  select * into v_receipt
  from public.finance_operation_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.operation_id = p_operation_id
  for update;
  if not found then return null; end if;
  if v_receipt.payload_hash <> p_payload_hash then
    raise exception using errcode = '23505', message = 'OPERATION_REUSED';
  end if;
  return v_receipt.sanitized_result;
end;
$$;

create function private.p309_assert_expected_version(p_actual bigint, p_expected bigint)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if p_actual is null or p_expected is null or p_actual <> p_expected then
    raise exception using errcode = '40001', message = 'STALE_VERSION';
  end if;
end;
$$;

create function private.p309_round_half_away_from_zero(p_value numeric)
returns bigint
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_result numeric;
begin
  if p_value is null then
    raise exception using errcode = '22023', message = 'ROUND_VALUE_REQUIRED';
  end if;
  v_result := case
    when p_value >= 0 then pg_catalog.floor(p_value + 0.5)
    else pg_catalog.ceil(p_value - 0.5)
  end;
  if v_result < -9223372036854775808::numeric or v_result > 9223372036854775807::numeric then
    raise exception using errcode = '22003', message = 'ROUND_RESULT_OUT_OF_RANGE';
  end if;
  return v_result::bigint;
end;
$$;

create function private.p309_line_amounts(
  p_quantity bigint,
  p_unit_amount_minor bigint,
  p_discount_minor bigint,
  p_tax_basis text,
  p_vat_basis_points integer
)
returns table (net_minor bigint, vat_minor bigint, total_minor bigint)
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_gross numeric;
  v_taxable numeric;
  v_net bigint;
  v_vat bigint;
  v_total bigint;
begin
  if p_quantity is null or p_quantity not between 1 and 1000000
    or p_unit_amount_minor is null or p_unit_amount_minor not between 0 and 100000000000
    or p_discount_minor is null or p_discount_minor < 0
    or p_vat_basis_points is null or p_vat_basis_points not between 0 and 10000
    or p_tax_basis not in ('exclusive', 'inclusive', 'exempt', 'zero_rated')
    or (p_tax_basis in ('exclusive', 'inclusive') and p_vat_basis_points <> 500)
    or (p_tax_basis in ('exempt', 'zero_rated') and p_vat_basis_points <> 0)
  then
    raise exception using errcode = '23514', message = 'LINE_INPUT_INVALID';
  end if;
  v_gross := p_quantity::numeric * p_unit_amount_minor::numeric;
  if p_discount_minor > v_gross then
    raise exception using errcode = '23514', message = 'DISCOUNT_EXCEEDS_BASE';
  end if;
  v_taxable := v_gross - p_discount_minor;
  if v_taxable > 100000000000 then
    raise exception using errcode = '22003', message = 'LINE_AMOUNT_OUT_OF_RANGE';
  end if;

  if p_tax_basis = 'exclusive' then
    v_net := v_taxable::bigint;
    v_vat := private.p309_round_half_away_from_zero(v_taxable * p_vat_basis_points / 10000);
    v_total := v_net + v_vat;
  elsif p_tax_basis = 'inclusive' then
    v_total := v_taxable::bigint;
    v_net := private.p309_round_half_away_from_zero(v_taxable * 10000 / (10000 + p_vat_basis_points));
    v_vat := v_total - v_net;
  else
    v_net := v_taxable::bigint;
    v_vat := 0;
    v_total := v_net;
  end if;
  perform private.p309_checked_money(v_net, 'AED');
  perform private.p309_checked_money(v_vat, 'AED');
  perform private.p309_checked_money(v_total, 'AED');
  return query select v_net, v_vat, v_total;
end;
$$;

create function private.p309_reject_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'FINANCE_RECORD_IMMUTABLE';
end;
$$;

create function private.p309_assert_invoice_line(p_line public.invoice_lines)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_net bigint;
  v_vat bigint;
  v_total bigint;
begin
  select * into v_invoice
  from public.invoices invoice
  where invoice.id = p_line.invoice_id
    and invoice.tenant_id = p_line.tenant_id
    and invoice.company_id = p_line.company_id
    and invoice.currency = p_line.currency
  for update;
  if not found or v_invoice.status <> 'draft' or not v_invoice.ledger_eligible then
    raise exception using errcode = '55000', message = 'INVOICE_LINES_REQUIRE_ELIGIBLE_DRAFT';
  end if;
  select amounts.net_minor, amounts.vat_minor, amounts.total_minor
  into v_net, v_vat, v_total
  from private.p309_line_amounts(
    p_line.quantity, p_line.unit_amount_minor, p_line.discount_minor,
    p_line.tax_basis, p_line.vat_basis_points
  ) amounts;
  if p_line.net_minor is distinct from v_net
    or p_line.vat_minor is distinct from v_vat
    or p_line.total_minor is distinct from v_total
  then
    raise exception using errcode = '23514', message = 'INVOICE_LINE_AMOUNTS_FORGED';
  end if;
end;
$$;

create function private.p309_guard_invoice_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.invoice_id is distinct from new.invoice_id
    or exists (
      select 1 from public.invoices invoice
      where invoice.id = old.invoice_id
        and invoice.tenant_id = old.tenant_id
        and invoice.company_id = old.company_id
        and invoice.status <> 'draft'
    )
  then
    raise exception using errcode = '55000', message = 'FINALIZED_INVOICE_LINE_IMMUTABLE';
  end if;
  perform private.p309_assert_invoice_line(new);
  return new;
end;
$$;

create function private.p309_guard_invoice_line_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.p309_assert_invoice_line(new);
  return new;
end;
$$;

create function private.p309_guard_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'FINANCE_JOURNAL_IMMUTABLE';
  end if;
  if old.state <> 'draft'
    or new.state <> 'posted'
    or new.posted_at is null
    or pg_catalog.current_setting('mandoob.p309_posting_journal', true) is distinct from old.id::text
    or (to_jsonb(new) - 'state' - 'posted_at' - 'source_category')
      is distinct from
      (to_jsonb(old) - 'state' - 'posted_at' - 'source_category')
  then
    raise exception using errcode = '55000', message = 'FINANCE_JOURNAL_IMMUTABLE';
  end if;
  return new;
end;
$$;

create function private.p309_guard_journal_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal public.finance_journals%rowtype;
begin
  select * into v_journal
  from public.finance_journals journal
  where journal.id = new.journal_id
  for update;
  if not found or v_journal.state <> 'draft' then
    raise exception using errcode = '55000',
      message = 'POSTED_JOURNAL_IMMUTABLE_P309_TASK12_CONCURRENCY_CONTRACT';
  end if;
  return new;
end;
$$;

create function private.p309_assert_operation_receipt(
  p_receipt_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_aggregate_kind text,
  p_aggregate_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.finance_operation_receipts receipt
    where receipt.id = p_receipt_id
      and receipt.tenant_id = p_tenant_id
      and receipt.company_id = p_company_id
      and receipt.aggregate_kind = p_aggregate_kind
      and receipt.aggregate_id = p_aggregate_id
  ) then
    raise exception using errcode = '23514', message = 'OPERATION_RECEIPT_AGGREGATE_MISMATCH';
  end if;
end;
$$;

create function private.p309_guard_credit_note_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_credited numeric;
  v_allocated numeric;
  v_refunded numeric;
begin
  perform private.p309_assert_operation_receipt(
    new.operation_receipt_id, new.tenant_id, new.company_id, 'credit_note', new.id
  );
  select * into v_invoice from public.invoices invoice
  where invoice.id = new.invoice_id
    and invoice.tenant_id = new.tenant_id
    and invoice.company_id = new.company_id
  for update;
  if not found or not v_invoice.ledger_eligible or v_invoice.finalized_at is null
    or v_invoice.status = 'void' or v_invoice.currency <> new.currency
  then
    raise exception using errcode = '23514', message = 'CREDIT_NOTE_INVOICE_INVALID';
  end if;
  select coalesce(sum(note.amount_minor), 0::numeric) into v_credited
  from public.finance_credit_notes note
  where note.invoice_id = new.invoice_id;
  select coalesce(sum(allocation.amount_minor), 0::numeric) into v_allocated
  from public.payment_allocations allocation
  where allocation.invoice_id = new.invoice_id;
  select coalesce(sum(allocation.amount_minor), 0::numeric) into v_refunded
  from public.refund_allocations allocation
  where allocation.invoice_id = new.invoice_id;
  if v_credited + v_allocated - v_refunded + new.amount_minor > v_invoice.amount_minor then
    raise exception using errcode = '23514', message = 'CREDIT_EXCEEDS_INVOICE';
  end if;
  return new;
end;
$$;

create function private.p309_guard_payment_allocation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_invoice_allocated numeric;
  v_invoice_credited numeric;
  v_payment_allocated numeric;
begin
  perform private.p309_assert_operation_receipt(
    new.operation_receipt_id, new.tenant_id, new.company_id, 'payment', new.payment_id
  );
  select * into v_invoice from public.invoices invoice
  where invoice.id = new.invoice_id
    and invoice.tenant_id = new.tenant_id
    and invoice.company_id = new.company_id
  for update;
  select * into v_payment from public.payments payment
  where payment.id = new.payment_id
    and payment.tenant_id = new.tenant_id
    and payment.invoice_id = new.invoice_id
  for update;
  if v_invoice.id is null or v_payment.id is null
    or not v_invoice.ledger_eligible or v_invoice.finalized_at is null
    or v_invoice.status = 'void' or v_payment.status <> 'succeeded'
    or v_invoice.currency <> new.currency or v_payment.currency <> new.currency
  then
    raise exception using errcode = '23514', message = 'PAYMENT_ALLOCATION_INVALID';
  end if;
  select coalesce(sum(allocation.amount_minor), 0::numeric) into v_invoice_allocated
  from public.payment_allocations allocation where allocation.invoice_id = new.invoice_id;
  select coalesce(sum(note.amount_minor), 0::numeric) into v_invoice_credited
  from public.finance_credit_notes note where note.invoice_id = new.invoice_id;
  select coalesce(sum(allocation.amount_minor), 0::numeric) into v_payment_allocated
  from public.payment_allocations allocation where allocation.payment_id = new.payment_id;
  if v_invoice_allocated + v_invoice_credited + new.amount_minor > v_invoice.amount_minor then
    raise exception using errcode = '23514', message = 'OVERPAYMENT';
  end if;
  if v_payment_allocated + new.amount_minor > v_payment.amount_minor then
    raise exception using errcode = '23514', message = 'PAYMENT_ALLOCATION_EXCEEDS_CAPTURE';
  end if;
  return new;
end;
$$;

create function private.p309_guard_refund_allocation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_allocation public.payment_allocations%rowtype;
  v_refund public.refunds%rowtype;
  v_allocation_refunded numeric;
  v_refund_allocated numeric;
begin
  perform private.p309_assert_operation_receipt(
    new.operation_receipt_id, new.tenant_id, new.company_id, 'refund', new.refund_id
  );
  select * into v_payment_allocation from public.payment_allocations allocation
  where allocation.id = new.payment_allocation_id
    and allocation.tenant_id = new.tenant_id
    and allocation.company_id = new.company_id
    and allocation.invoice_id = new.invoice_id
    and allocation.payment_id = new.payment_id
  for update;
  select * into v_refund from public.refunds refund
  where refund.id = new.refund_id
    and refund.tenant_id = new.tenant_id
    and refund.payment_id = new.payment_id
  for update;
  if v_payment_allocation.id is null or v_refund.id is null
    or v_refund.ledger_eligible is not true
    or v_refund.status <> 'succeeded'
    or v_refund.currency <> new.currency
    or v_payment_allocation.currency <> new.currency
  then
    raise exception using errcode = '23514', message = 'REFUND_ALLOCATION_INVALID';
  end if;
  select coalesce(sum(allocation.amount_minor), 0::numeric) into v_allocation_refunded
  from public.refund_allocations allocation
  where allocation.payment_allocation_id = new.payment_allocation_id;
  select coalesce(sum(allocation.amount_minor), 0::numeric) into v_refund_allocated
  from public.refund_allocations allocation where allocation.refund_id = new.refund_id;
  if v_allocation_refunded + new.amount_minor > v_payment_allocation.amount_minor
    or v_refund_allocated + new.amount_minor > v_refund.amount_minor
  then
    raise exception using errcode = '23514', message = 'REFUND_EXCEEDS_CAPTURE';
  end if;
  return new;
end;
$$;

create function private.p309_guard_journal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aggregate_kind text;
  v_aggregate_id uuid;
begin
  case new.source_kind
    when 'invoice' then v_aggregate_kind := 'invoice'; v_aggregate_id := new.source_id;
    when 'invoice_void' then v_aggregate_kind := 'invoice'; v_aggregate_id := new.source_id;
    when 'subscription_invoice' then v_aggregate_kind := 'invoice'; v_aggregate_id := new.source_id;
    when 'credit_note' then v_aggregate_kind := 'credit_note'; v_aggregate_id := new.source_id;
    when 'cash_refund' then v_aggregate_kind := 'refund'; v_aggregate_id := new.source_id;
    when 'expense' then v_aggregate_kind := 'expense'; v_aggregate_id := new.source_id;
    when 'expense_reversal' then v_aggregate_kind := 'expense'; v_aggregate_id := new.source_id;
    when 'compensation' then v_aggregate_kind := 'compensation'; v_aggregate_id := new.source_id;
    when 'compensation_reversal' then v_aggregate_kind := 'compensation'; v_aggregate_id := new.source_id;
    when 'payment_allocation' then
      v_aggregate_kind := 'payment';
      select allocation.payment_id into v_aggregate_id
      from public.payment_allocations allocation
      where allocation.id = new.source_id
        and allocation.tenant_id = new.tenant_id
        and allocation.company_id = new.company_id;
    else
      raise exception using errcode = '23514', message = 'JOURNAL_SOURCE_UNSUPPORTED';
  end case;
  if v_aggregate_id is null then
    raise exception using errcode = '23514', message = 'JOURNAL_SOURCE_NOT_FOUND';
  end if;
  perform private.p309_assert_operation_receipt(
    new.operation_receipt_id, new.tenant_id, new.company_id, v_aggregate_kind, v_aggregate_id
  );
  return new;
end;
$$;

create function private.p309_guard_financial_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or new.version <> old.version + 1
    or (to_jsonb(new) - 'state' - 'version' - 'updated_at' - 'posted_journal_id' - 'source_reference_normalized')
      is distinct from
      (to_jsonb(old) - 'state' - 'version' - 'updated_at' - 'posted_journal_id' - 'source_reference_normalized')
    or not (
      (old.state = 'draft' and new.state = 'approved' and new.posted_journal_id is null)
      or (old.state = 'approved' and new.state = 'posted' and new.posted_journal_id is not null)
      or (old.state = 'posted' and new.state = 'reversed'
        and new.posted_journal_id is not distinct from old.posted_journal_id)
    )
  then
    raise exception using errcode = '55000', message = 'FINANCIAL_DOCUMENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create function private.p309_guard_posted_document_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal public.finance_journals%rowtype;
  v_term public.pro_commercial_terms%rowtype;
  v_assignment public.pro_company_assignments%rowtype;
begin
  perform private.p309_assert_operation_receipt(
    new.operation_receipt_id, new.tenant_id, new.company_id, tg_argv[0], new.id
  );
  if new.posted_journal_id is not null then
    select * into v_journal from public.finance_journals journal
    where journal.id = new.posted_journal_id
      and journal.tenant_id = new.tenant_id
      and journal.company_id = new.company_id
      and journal.currency = new.currency
      and journal.source_kind = tg_argv[0]
      and journal.source_id = new.id
      and journal.state = 'posted';
    if not found then
      raise exception using errcode = '23514', message = 'POSTED_JOURNAL_PROVENANCE_INVALID';
    end if;
  end if;
  if tg_argv[0] = 'compensation' and (to_jsonb(new)->>'commercial_term_id') is not null then
    select * into v_assignment from public.pro_company_assignments assignment
    where assignment.id = new.company_assignment_id
      and assignment.tenant_id = new.tenant_id
      and assignment.company_id = new.company_id
      and assignment.pro_profile_id = new.pro_profile_id
      and assignment.assigned_at = new.company_assignment_assigned_at;
    if not found then
      raise exception using errcode = '23514', message = 'COMPENSATION_ASSIGNMENT_PROVENANCE_INVALID';
    end if;
    select * into v_term from public.pro_commercial_terms term
    where term.id = new.commercial_term_id
      and term.pro_profile_id = new.pro_profile_id
      and term.term_kind = 'compensation'
      and term.version = new.commercial_term_version
      and term.currency = new.currency
      and term.model = new.commercial_term_model
      and term.amount_minor = new.commercial_term_amount_minor
      and term.scope = new.commercial_term_scope
      and term.effective_from = new.commercial_term_effective_from;
    if not found then
      raise exception using errcode = '23514', message = 'COMPENSATION_TERM_PROVENANCE_INVALID';
    end if;
    if new.state in ('approved', 'posted')
      and (tg_op = 'INSERT' or old.state is distinct from new.state)
      and v_assignment.status <> 'active'
    then
      raise exception using errcode = '23514', message = 'COMPENSATION_ASSIGNMENT_NOT_ACTIVE';
    end if;
  end if;
  return new;
end;
$$;

create function private.p309_assert_journal_source(
  p_journal public.finance_journals,
  p_posted_amount numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_amount bigint;
  v_accounts_valid boolean := false;
begin
  case p_journal.source_kind
    when 'invoice' then
      select invoice.amount_minor into v_source_amount
      from public.invoices invoice
      where invoice.id = p_journal.source_id
        and invoice.tenant_id = p_journal.tenant_id
        and invoice.company_id = p_journal.company_id
        and invoice.currency = p_journal.currency
        and invoice.ledger_eligible and invoice.finalized_at is not null;
      select not exists (
        select 1 from public.finance_journal_entries entry
        where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code <> 'receivable')
            or (entry.credit_minor > 0 and entry.account_code not in (
              'service_revenue', 'government_revenue', 'subscription_revenue', 'vat_payable'
            )))
      ) into v_accounts_valid;
    when 'subscription_invoice' then
      select invoice.amount_minor into v_source_amount
      from public.invoices invoice
      where invoice.id = p_journal.source_id
        and invoice.tenant_id = p_journal.tenant_id
        and invoice.company_id = p_journal.company_id
        and invoice.currency = p_journal.currency
        and invoice.ledger_eligible and invoice.finalized_at is not null;
      select not exists (
        select 1 from public.finance_journal_entries entry
        where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code <> 'receivable')
            or (entry.credit_minor > 0 and entry.account_code not in ('subscription_revenue', 'vat_payable')))
      ) into v_accounts_valid;
    when 'invoice_void' then
      select invoice.amount_minor into v_source_amount
      from public.invoices invoice
      where invoice.id = p_journal.source_id
        and invoice.tenant_id = p_journal.tenant_id
        and invoice.company_id = p_journal.company_id
        and invoice.currency = p_journal.currency
        and invoice.ledger_eligible and invoice.status = 'void';
      select not exists (
        select 1 from public.finance_journal_entries entry
        where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code not in (
              'service_revenue', 'government_revenue', 'subscription_revenue', 'vat_payable'
            )) or (entry.credit_minor > 0 and entry.account_code <> 'receivable'))
      ) into v_accounts_valid;
    when 'payment_allocation' then
      select allocation.amount_minor into v_source_amount
      from public.payment_allocations allocation
      where allocation.id = p_journal.source_id and allocation.tenant_id = p_journal.tenant_id
        and allocation.company_id = p_journal.company_id and allocation.currency = p_journal.currency;
      select not exists (
        select 1 from public.finance_journal_entries entry where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code not in ('cash_clearing', 'bank_clearing'))
            or (entry.credit_minor > 0 and entry.account_code <> 'receivable'))
      ) into v_accounts_valid;
    when 'cash_refund' then
      select refund.amount_minor into v_source_amount
      from public.refunds refund
      join public.payments payment on payment.id = refund.payment_id and payment.tenant_id = refund.tenant_id
      join public.invoices invoice on invoice.id = payment.invoice_id and invoice.tenant_id = payment.tenant_id
      where refund.id = p_journal.source_id and refund.tenant_id = p_journal.tenant_id
        and invoice.company_id = p_journal.company_id and refund.currency = p_journal.currency
        and refund.ledger_eligible and refund.status = 'succeeded';
      select not exists (
        select 1 from public.finance_journal_entries entry where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code <> 'receivable')
            or (entry.credit_minor > 0 and entry.account_code not in ('cash_clearing', 'bank_clearing')))
      ) into v_accounts_valid;
    when 'credit_note' then
      select note.amount_minor into v_source_amount
      from public.finance_credit_notes note
      where note.id = p_journal.source_id and note.tenant_id = p_journal.tenant_id
        and note.company_id = p_journal.company_id and note.currency = p_journal.currency;
      select not exists (
        select 1 from public.finance_journal_entries entry where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code not in ('refund_contra_revenue', 'vat_payable'))
            or (entry.credit_minor > 0 and entry.account_code <> 'receivable'))
      ) into v_accounts_valid;
    when 'expense' then
      select expense.amount_minor into v_source_amount
      from public.finance_expenses expense
      where expense.id = p_journal.source_id and expense.tenant_id = p_journal.tenant_id
        and expense.company_id = p_journal.company_id and expense.currency = p_journal.currency
        and expense.state = 'approved';
      select not exists (
        select 1 from public.finance_journal_entries entry where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code <> 'expense')
            or (entry.credit_minor > 0 and entry.account_code not in ('cash_clearing', 'bank_clearing')))
      ) into v_accounts_valid;
    when 'compensation' then
      select compensation.amount_minor into v_source_amount
      from public.pro_compensations compensation
      where compensation.id = p_journal.source_id and compensation.tenant_id = p_journal.tenant_id
        and compensation.company_id = p_journal.company_id
        and compensation.currency = p_journal.currency and compensation.state = 'approved';
      select not exists (
        select 1 from public.finance_journal_entries entry where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code <> 'expense')
            or (entry.credit_minor > 0 and entry.account_code <> 'pro_compensation_payable'))
      ) into v_accounts_valid;
    when 'expense_reversal' then
      select expense.amount_minor into v_source_amount
      from public.finance_expenses expense
      where expense.id = p_journal.source_id and expense.tenant_id = p_journal.tenant_id
        and expense.company_id = p_journal.company_id and expense.currency = p_journal.currency
        and expense.state = 'posted';
      select not exists (
        select 1 from public.finance_journal_entries entry where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code not in ('cash_clearing', 'bank_clearing'))
            or (entry.credit_minor > 0 and entry.account_code <> 'expense'))
      ) into v_accounts_valid;
    when 'compensation_reversal' then
      select compensation.amount_minor into v_source_amount
      from public.pro_compensations compensation
      where compensation.id = p_journal.source_id and compensation.tenant_id = p_journal.tenant_id
        and compensation.company_id = p_journal.company_id
        and compensation.currency = p_journal.currency and compensation.state = 'posted';
      select not exists (
        select 1 from public.finance_journal_entries entry where entry.journal_id = p_journal.id
          and ((entry.debit_minor > 0 and entry.account_code <> 'pro_compensation_payable')
            or (entry.credit_minor > 0 and entry.account_code <> 'expense'))
      ) into v_accounts_valid;
    else
      raise exception using errcode = '23514', message = 'JOURNAL_SOURCE_UNSUPPORTED';
  end case;
  if v_source_amount is null or v_source_amount::numeric <> p_posted_amount or not v_accounts_valid then
    raise exception using errcode = '23514', message = 'JOURNAL_SOURCE_AMOUNT_OR_ACCOUNTS_INVALID';
  end if;
end;
$$;

create function private.p309_post_journal(p_journal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal public.finance_journals%rowtype;
  v_debit numeric;
  v_credit numeric;
  v_count bigint;
begin
  select * into v_journal
  from public.finance_journals journal
  where journal.id = p_journal_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'JOURNAL_NOT_FOUND';
  end if;
  if v_journal.state <> 'draft' then
    raise exception using errcode = '55000', message = 'JOURNAL_ALREADY_POSTED';
  end if;
  if v_journal.source_kind = 'cash_refund' and not exists (
    select 1
    from public.refunds refund
    join public.payments payment
      on payment.id = refund.payment_id and payment.tenant_id = refund.tenant_id
    join public.invoices invoice
      on invoice.id = payment.invoice_id and invoice.tenant_id = payment.tenant_id
    where refund.id = v_journal.source_id
      and refund.tenant_id = v_journal.tenant_id
      and refund.ledger_eligible
      and refund.status = 'succeeded'
      and refund.currency = v_journal.currency
      and invoice.company_id = v_journal.company_id
  ) then
    raise exception using errcode = '23514', message = 'REFUND_NOT_LEDGER_ELIGIBLE';
  end if;
  select count(*), sum(debit_minor), sum(credit_minor)
    into v_count, v_debit, v_credit
  from public.finance_journal_entries entry
  where entry.journal_id = p_journal_id;
  if v_count < 2 or v_debit is distinct from v_credit or v_debit <= 0 then
    raise exception using errcode = '23514', message = 'JOURNAL_UNBALANCED';
  end if;
  if v_debit > 100000000000 or v_credit > 100000000000 then
    raise exception using errcode = '22003', message = 'JOURNAL_AMOUNT_OUT_OF_RANGE';
  end if;
  perform private.p309_assert_journal_source(v_journal, v_debit);
  perform pg_catalog.set_config('mandoob.p309_posting_journal', p_journal_id::text, true);
  update public.finance_journals
  set state = 'posted', posted_at = pg_catalog.clock_timestamp()
  where id = p_journal_id;
  return p_journal_id;
end;
$$;

create trigger finance_operation_receipts_immutable
  before update or delete on public.finance_operation_receipts
  for each row execute function private.p309_reject_mutation();
create trigger invoice_lines_immutable
  before update on public.invoice_lines
  for each row execute function private.p309_guard_invoice_line();
create trigger invoice_lines_draft_only
  before insert on public.invoice_lines
  for each row execute function private.p309_guard_invoice_line_insert();
create trigger invoice_lines_no_delete
  before delete on public.invoice_lines
  for each row execute function private.p309_reject_mutation();
create trigger finance_credit_notes_immutable
  before update or delete on public.finance_credit_notes
  for each row execute function private.p309_reject_mutation();
create trigger finance_credit_notes_ceiling
  before insert on public.finance_credit_notes
  for each row execute function private.p309_guard_credit_note_insert();
create trigger payment_allocations_immutable
  before update or delete on public.payment_allocations
  for each row execute function private.p309_reject_mutation();
create trigger payment_allocations_ceiling
  before insert on public.payment_allocations
  for each row execute function private.p309_guard_payment_allocation_insert();
create trigger refund_allocations_immutable
  before update or delete on public.refund_allocations
  for each row execute function private.p309_reject_mutation();
create trigger refund_allocations_ceiling
  before insert on public.refund_allocations
  for each row execute function private.p309_guard_refund_allocation_insert();
create trigger finance_journals_source_receipt
  before insert on public.finance_journals
  for each row execute function private.p309_guard_journal_insert();
create trigger finance_journals_immutable
  before update or delete on public.finance_journals
  for each row execute function private.p309_guard_journal();
create trigger finance_journal_entries_immutable
  before update or delete on public.finance_journal_entries
  for each row execute function private.p309_reject_mutation();
create trigger finance_journal_entries_draft_only
  before insert on public.finance_journal_entries
  for each row execute function private.p309_guard_journal_entry_insert();
create trigger finance_expenses_immutable
  before update or delete on public.finance_expenses
  for each row execute function private.p309_guard_financial_document();
create trigger finance_expenses_posted_provenance
  before insert or update on public.finance_expenses
  for each row execute function private.p309_guard_posted_document_provenance('expense');
create trigger pro_compensations_immutable
  before update or delete on public.pro_compensations
  for each row execute function private.p309_guard_financial_document();
create trigger pro_compensations_posted_provenance
  before insert or update on public.pro_compensations
  for each row execute function private.p309_guard_posted_document_provenance('compensation');
create trigger finance_audit_log_immutable
  before update or delete on public.finance_audit_log
  for each row execute function private.p309_reject_mutation();

alter table public.finance_currencies enable row level security;
alter table public.finance_operation_receipts enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.finance_credit_notes enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.refund_allocations enable row level security;
alter table public.finance_journals enable row level security;
alter table public.finance_journal_entries enable row level security;
alter table public.finance_expenses enable row level security;
alter table public.pro_compensations enable row level security;
alter table public.finance_audit_log enable row level security;

revoke all on table public.finance_currencies from public, anon, authenticated, service_role;
revoke all on table public.finance_operation_receipts from public, anon, authenticated, service_role;
revoke all on table public.invoice_lines from public, anon, authenticated, service_role;
revoke all on table public.finance_credit_notes from public, anon, authenticated, service_role;
revoke all on table public.payment_allocations from public, anon, authenticated, service_role;
revoke all on table public.refund_allocations from public, anon, authenticated, service_role;
revoke all on table public.finance_journals from public, anon, authenticated, service_role;
revoke all on table public.finance_journal_entries from public, anon, authenticated, service_role;
revoke all on table public.finance_expenses from public, anon, authenticated, service_role;
revoke all on table public.pro_compensations from public, anon, authenticated, service_role;
revoke all on table public.finance_audit_log from public, anon, authenticated, service_role;

revoke insert, update, delete on table public.invoices, public.payments, public.refunds
  from public, anon, authenticated;

alter function private.p309_checked_money(bigint, text) owner to postgres;
alter function private.p309_replay_receipt(uuid, uuid, text) owner to postgres;
alter function private.p309_assert_expected_version(bigint, bigint) owner to postgres;
alter function private.p309_round_half_away_from_zero(numeric) owner to postgres;
alter function private.p309_line_amounts(bigint, bigint, bigint, text, integer) owner to postgres;
alter function private.p309_reject_mutation() owner to postgres;
alter function private.p309_assert_invoice_line(public.invoice_lines) owner to postgres;
alter function private.p309_guard_invoice_line() owner to postgres;
alter function private.p309_guard_invoice_line_insert() owner to postgres;
alter function private.p309_guard_journal() owner to postgres;
alter function private.p309_guard_journal_entry_insert() owner to postgres;
alter function private.p309_assert_operation_receipt(uuid, uuid, uuid, text, uuid) owner to postgres;
alter function private.p309_guard_credit_note_insert() owner to postgres;
alter function private.p309_guard_payment_allocation_insert() owner to postgres;
alter function private.p309_guard_refund_allocation_insert() owner to postgres;
alter function private.p309_guard_journal_insert() owner to postgres;
alter function private.p309_guard_financial_document() owner to postgres;
alter function private.p309_guard_posted_document_provenance() owner to postgres;
alter function private.p309_assert_journal_source(public.finance_journals, numeric) owner to postgres;
alter function private.p309_post_journal(uuid) owner to postgres;

revoke all on function private.p309_checked_money(bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.p309_replay_receipt(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.p309_assert_expected_version(bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function private.p309_round_half_away_from_zero(numeric) from public, anon, authenticated, service_role;
revoke all on function private.p309_line_amounts(bigint, bigint, bigint, text, integer) from public, anon, authenticated, service_role;
revoke all on function private.p309_reject_mutation() from public, anon, authenticated, service_role;
revoke all on function private.p309_assert_invoice_line(public.invoice_lines) from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_invoice_line() from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_invoice_line_insert() from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_journal() from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_journal_entry_insert() from public, anon, authenticated, service_role;
revoke all on function private.p309_assert_operation_receipt(uuid, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_credit_note_insert() from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_payment_allocation_insert() from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_refund_allocation_insert() from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_journal_insert() from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_financial_document() from public, anon, authenticated, service_role;
revoke all on function private.p309_guard_posted_document_provenance() from public, anon, authenticated, service_role;
revoke all on function private.p309_assert_journal_source(public.finance_journals, numeric) from public, anon, authenticated, service_role;
revoke all on function private.p309_post_journal(uuid) from public, anon, authenticated, service_role;

commit;
