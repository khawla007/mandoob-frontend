import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260922090000_p309_finance_ledger.sql',
);
const fixturePath = join(process.cwd(), 'supabase/tests/p309_finance_ledger.sql');
const legacyRefundHarnessPath = join(
  process.cwd(),
  'supabase/tests/p309_finance_legacy_refund_migration_harness.sql',
);

function source(path: string): string {
  return existsSync(path)
    ? readFileSync(path, 'utf8').replace(/--.*$/gmu, '').replace(/\s+/gu, ' ').toLowerCase()
    : '';
}

const sql = source(migrationPath);

test('P3.09 core adds tenant-owned immutable finance records without replacing legacy rows', () => {
  for (const table of [
    'finance_currencies',
    'finance_operation_receipts',
    'invoice_lines',
    'finance_credit_notes',
    'payment_allocations',
    'refund_allocations',
    'finance_journals',
    'finance_journal_entries',
    'finance_expenses',
    'pro_compensations',
    'finance_audit_log',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`), `missing ${table}`);
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(
    sql,
    /foreign key \(tenant_id, company_id\) references public\.company_profiles \(tenant_id, id\)/u,
  );
  assert.match(sql, /foreign key \(tenant_id, company_id, invoice_id\)/u);
  assert.match(sql, /references public\.invoices \(tenant_id, company_id, id\)/u);
  assert.match(sql, /invoices_customer_company_fk/u);
  assert.match(sql, /add column ledger_eligible boolean not null default false/u);
  assert.match(sql, /alter table public\.refunds add column currency text/u);
  assert.match(
    sql,
    /update public\.refunds refund[\s\S]*from public\.payments payment[\s\S]*public\.invoices invoice/u,
  );
  assert.doesNotMatch(sql, /refund_currency_chain_invalid/u);
  assert.doesNotMatch(sql, /drop table public\.(invoices|payments|refunds)/u);
});

test('P3.09 core centralizes checked minor-unit and VAT arithmetic', () => {
  for (const helper of [
    'p309_checked_money',
    'p309_round_half_away_from_zero',
    'p309_line_amounts',
  ]) {
    assert.match(
      sql,
      new RegExp(`create function private\\.${helper}\\([\\s\\S]*?set search_path = ''`),
    );
  }
  assert.match(sql, /100000000000/u);
  assert.match(sql, /create table public\.finance_currencies/u);
  assert.match(sql, /insert into public\.finance_currencies \(code\) values/u);
  assert.match(sql, /references public\.finance_currencies \(code\)/u);
  assert.match(sql, /where currency\.code = p_currency/u);
  assert.doesNotMatch(sql, /if p_currency is null or p_currency !~/u);
  assert.match(sql, /exclusive[\s\S]*inclusive[\s\S]*exempt[\s\S]*zero_rated/u);
  assert.match(sql, /discount_minor <=/u);
  assert.match(sql, /vat_basis_points between 0 and 10000/u);
  assert.match(
    sql,
    /tax_category = 'standard' and tax_basis in \('exclusive', 'inclusive'\) and vat_basis_points = 500/u,
  );
  const lineAmounts = sql.match(/create function private\.p309_line_amounts[\s\S]*?\$\$;/u)?.[0];
  assert.ok(lineAmounts);
  assert.match(
    lineAmounts,
    /p_tax_basis in \('exclusive', 'inclusive'\)[\s\S]*p_vat_basis_points <> 500/u,
  );
  assert.match(
    lineAmounts,
    /p_tax_basis in \('exempt', 'zero_rated'\)[\s\S]*p_vat_basis_points <> 0/u,
  );
  const lineValidator = sql.match(
    /create function private\.p309_assert_invoice_line[\s\S]*?\$\$;/u,
  )?.[0];
  assert.ok(lineValidator);
  assert.match(lineValidator, /invoice\.currency = p_line\.currency/u);
  assert.match(lineValidator, /private\.p309_line_amounts\(/u);
  assert.match(lineValidator, /p_line\.net_minor is distinct from v_net/u);
  assert.match(lineValidator, /p_line\.vat_minor is distinct from v_vat/u);
  assert.match(lineValidator, /p_line\.total_minor is distinct from v_total/u);
  assert.match(lineValidator, /invoice_line_amounts_forged/u);
  const insertGuard = sql.match(
    /create function private\.p309_guard_invoice_line_insert[\s\S]*?\$\$;/u,
  )?.[0];
  const updateGuard = sql.match(
    /create function private\.p309_guard_invoice_line\(\)[\s\S]*?\$\$;/u,
  )?.[0];
  assert.ok(insertGuard);
  assert.ok(updateGuard);
  assert.match(insertGuard, /private\.p309_assert_invoice_line\(new\)/u);
  assert.match(updateGuard, /private\.p309_assert_invoice_line\(new\)/u);
  assert.match(
    sql,
    /create trigger invoice_lines_immutable before update on public\.invoice_lines for each row execute function private\.p309_guard_invoice_line\(\)/u,
  );
  assert.match(
    sql,
    /create trigger invoice_lines_draft_only before insert on public\.invoice_lines for each row execute function private\.p309_guard_invoice_line_insert\(\)/u,
  );
});

test('legacy refunds are preserved, classified, and only safe rows become ledger eligible', () => {
  assert.match(sql, /add column ledger_eligible boolean not null default false/u);
  assert.match(
    sql,
    /add column quarantine_reason text not null default 'legacy_pending_validation'/u,
  );
  assert.match(
    sql,
    /update public\.refunds refund set currency = payment\.currency,[\s\S]*ledger_eligible = true,[\s\S]*quarantine_reason = null/u,
  );
  assert.match(sql, /legacy_missing_payment/u);
  assert.match(sql, /legacy_missing_invoice/u);
  assert.match(sql, /legacy_currency_mismatch/u);
  assert.match(sql, /legacy_currency_unsupported/u);
  assert.match(sql, /refund\.ledger_eligible is not true/u);
  assert.match(sql, /v_journal\.source_kind = 'cash_refund'[\s\S]*refund\.ledger_eligible/u);
  assert.doesNotMatch(sql, /message = 'refund_currency_chain_invalid'/u);
  assert.doesNotMatch(sql, /alter column currency set not null/u);
});

test('P3.09 core posts only balanced, single-currency immutable journals', () => {
  assert.match(sql, /create function private\.p309_post_journal/u);
  assert.match(sql, /sum\(debit_minor\)[\s\S]*sum\(credit_minor\)/u);
  assert.match(sql, /journal_unbalanced/u);
  assert.match(sql, /foreign key \(journal_id, currency\)/u);
  assert.match(sql, /references public\.finance_journals \(id, currency\)/u);
  assert.match(sql, /create trigger finance_journals_immutable/u);
  assert.match(sql, /create trigger finance_journal_entries_immutable/u);
  assert.match(
    sql,
    /when 'cash_refund'[\s\S]*entry\.debit_minor > 0 and entry\.account_code <> 'receivable'/u,
  );
  assert.match(
    sql,
    /when 'credit_note'[\s\S]*entry\.debit_minor > 0 and entry\.account_code not in \([\s\S]*'refund_contra_revenue'[\s\S]*'vat_payable'/u,
  );
  assert.match(
    sql,
    /v_credited \+ v_allocated - v_refunded \+ new\.amount_minor > v_invoice\.amount_minor/u,
  );
  assert.match(sql, /raise exception using errcode = '55000'/u);
  assert.match(sql, /create function private\.p309_replay_receipt/u);
  assert.match(sql, /create function private\.p309_assert_expected_version/u);
  const entryGuard = sql.match(
    /create function private\.p309_guard_journal_entry_insert[\s\S]*?\$\$;/u,
  )?.[0];
  assert.ok(entryGuard);
  assert.match(entryGuard, /from public\.finance_journals journal[\s\S]*for update/u);
  assert.match(entryGuard, /v_journal\.state <> 'draft'/u);
  const journalGuard = sql.match(
    /create function private\.p309_guard_journal\(\)[\s\S]*?\$\$;/u,
  )?.[0];
  assert.ok(journalGuard);
  assert.match(journalGuard, /current_setting\('mandoob\.p309_posting_journal', true\)/u);
  assert.match(journalGuard, /to_jsonb\(new\) - 'state' - 'posted_at' - 'source_category'/u);
  assert.match(journalGuard, /to_jsonb\(old\) - 'state' - 'posted_at' - 'source_category'/u);
  assert.match(sql, /set_config\('mandoob\.p309_posting_journal', p_journal_id::text, true\)/u);
  assert.match(sql, /p309_task12_concurrency_contract/u);
  assert.match(sql, /create function private\.p309_assert_journal_source/u);
  assert.match(
    sql,
    /source_category text generated always as[\s\S]*invoice_recognition[\s\S]*invoice_reversal[\s\S]*stored/u,
  );
  assert.match(
    sql,
    /create unique index finance_journals_one_posted_source[\s\S]*tenant_id, company_id, source_category, source_id[\s\S]*where state = 'posted'/u,
  );
  const journalTable = sql.match(/create table public\.finance_journals[\s\S]*?\);/u)?.[0];
  const entryTable = sql.match(/create table public\.finance_journal_entries[\s\S]*?\);/u)?.[0];
  assert.ok(journalTable);
  assert.ok(entryTable);
  assert.doesNotMatch(journalTable, /'adjustment'/u);
  assert.doesNotMatch(entryTable, /'adjustment'/u);
});

test('credits reduce allocatable receivable and serialize on the invoice', () => {
  assert.doesNotMatch(sql, /pg_catalog\.coalesce/u);
  assert.match(sql, /coalesce\(sum\(note\.amount_minor\), 0::numeric\)/u);
  const allocationGuard = sql.match(
    /create function private\.p309_guard_payment_allocation_insert[\s\S]*?\$\$;/u,
  )?.[0];
  assert.ok(allocationGuard);
  assert.match(allocationGuard, /for update/u);
  assert.match(allocationGuard, /from public\.finance_credit_notes/u);
  assert.match(
    allocationGuard,
    /v_invoice_allocated \+ v_invoice_credited \+ new\.amount_minor > v_invoice\.amount_minor/u,
  );
  const creditGuard = sql.match(
    /create function private\.p309_guard_credit_note_insert[\s\S]*?\$\$;/u,
  )?.[0];
  assert.ok(creditGuard);
  assert.match(creditGuard, /from public\.payment_allocations/u);
  assert.match(
    creditGuard,
    /v_credited \+ v_allocated - v_refunded \+ new\.amount_minor > v_invoice\.amount_minor/u,
  );
  assert.match(creditGuard, /p309_assert_operation_receipt/u);
  assert.match(allocationGuard, /p309_assert_operation_receipt/u);
  const refundGuard = sql.match(
    /create function private\.p309_guard_refund_allocation_insert[\s\S]*?\$\$;/u,
  )?.[0];
  const journalInsertGuard = sql.match(
    /create function private\.p309_guard_journal_insert[\s\S]*?\$\$;/u,
  )?.[0];
  assert.ok(refundGuard);
  assert.ok(journalInsertGuard);
  assert.match(refundGuard, /p309_assert_operation_receipt/u);
  assert.match(journalInsertGuard, /p309_assert_operation_receipt/u);
});

test('P3.09 core is least-privilege and replay/audit records are append-only', () => {
  for (const table of [
    'finance_currencies',
    'finance_operation_receipts',
    'invoice_lines',
    'finance_credit_notes',
    'payment_allocations',
    'refund_allocations',
    'finance_journals',
    'finance_journal_entries',
    'finance_expenses',
    'pro_compensations',
    'finance_audit_log',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on table public\\.${table} from public, anon, authenticated, service_role`,
      ),
    );
  }
  assert.match(sql, /payload_hash ~ '\^\[a-f0-9\]\{64\}\$'/u);
  assert.match(sql, /unique \(actor_id, operation_id\)/u);
  assert.match(sql, /create trigger finance_operation_receipts_immutable/u);
  assert.match(sql, /create trigger finance_audit_log_immutable/u);
  assert.doesNotMatch(
    sql,
    /grant (insert|update|delete|all)[^;]+to (anon|authenticated|service_role)/u,
  );
  assert.doesNotMatch(
    sql,
    /revoke insert, update, delete on table public\.invoices, public\.payments, public\.refunds from service_role/u,
  );
});

test('P3.09 core snapshots expense and compensation provenance without mutating owners', () => {
  assert.match(sql, /pro_profile_id uuid not null references public\.profiles/u);
  assert.match(sql, /commercial_term_id uuid/u);
  assert.match(sql, /commercial_term_version bigint/u);
  assert.match(sql, /commercial_term_model public\.pro_term_model not null/u);
  assert.match(sql, /commercial_term_amount_minor bigint not null/u);
  assert.match(sql, /commercial_term_scope text not null/u);
  assert.match(sql, /commercial_term_effective_from date not null/u);
  assert.match(sql, /company_assignment_id uuid not null/u);
  assert.match(sql, /company_assignment_assigned_at timestamptz not null/u);
  assert.match(sql, /source_reference text/u);
  assert.match(sql, /create trigger finance_expenses_immutable/u);
  assert.match(sql, /create trigger pro_compensations_immutable/u);
  assert.match(
    sql,
    /foreign key \(tenant_id, company_id, currency, posted_journal_id\)[\s\S]*references public\.finance_journals \(tenant_id, company_id, currency, id\)/u,
  );
  assert.match(
    sql,
    /foreign key \(pro_profile_id, commercial_term_id\)[\s\S]*references public\.pro_commercial_terms \(pro_profile_id, id\)/u,
  );
  assert.match(sql, /journal\.source_kind = tg_argv\[0\]/u);
  assert.match(sql, /term\.version = new\.commercial_term_version/u);
  assert.match(sql, /finance_expenses_lifecycle_shape/u);
  assert.match(sql, /pro_compensations_lifecycle_shape/u);
  assert.match(sql, /state = 'draft' and version = 1/u);
  assert.match(sql, /expense_reversal/u);
  assert.match(sql, /compensation_reversal/u);
  assert.doesNotMatch(
    sql,
    /new\.state in \('approved', 'posted'\)[\s\S]*term\.status <> 'active'/u,
  );
  assert.match(sql, /v_assignment\.status <> 'active'/u);
  assert.match(
    sql,
    /foreign key \(\s*tenant_id, company_id, pro_profile_id, company_assignment_id, company_assignment_assigned_at\s*\)/u,
  );
  assert.match(sql, /private\.p309_assert_operation_receipt\(/u);
  assert.doesNotMatch(sql, /alter table public\.(pro_commercial_terms|pro_company_assignments)/u);
  assert.doesNotMatch(
    sql,
    /alter table public\.(domain_events|event_jobs|event_contract_registrations)/u,
  );
  assert.doesNotMatch(sql, /alter table public\.(documents|document_versions)/u);
});

test('core SQL fixture exercises database invariants and remains rollback-only', () => {
  const fixture = source(fixturePath);
  assert.match(fixture, /^\\set on_error_stop on/u);
  assert.match(fixture, /begin;/u);
  assert.match(fixture, /rollback;\s*$/u);
  for (const proof of [
    'direct_write_not_revoked',
    'cross_company_invoice_line_accepted',
    'finalized_line_mutated',
    'mixed_currency_journal_accepted',
    'unbalanced_journal_accepted',
    'money_limit_not_enforced',
    'vat_rounding_mismatch',
    'standard_vat_rate_mismatch_accepted',
    'standard_line_vat_rate_mismatch_accepted',
    'discount_exceeds_base_accepted',
    'legacy_invoice_postable',
    'cross_currency_invoice_line_accepted',
    'forged_inclusive_vat_accepted',
    'forged_exclusive_vat_accepted',
    'forged_vat_update_accepted',
    'direct_journal_post_accepted',
    'late_journal_entry_accepted',
    'legacy_service_role_writer_revoked',
    'invalid_expense_lifecycle_accepted',
    'invalid_compensation_lifecycle_accepted',
    'credit_receipt_mismatch_accepted',
    'allocation_receipt_mismatch_accepted',
    'refund_receipt_mismatch_accepted',
    'journal_receipt_mismatch_accepted',
    'journal_source_amount_mismatch_accepted',
    'journal_source_accounts_mismatch_accepted',
    'duplicate_source_post_accepted',
    'invoice_reversal_source_collided',
    'historical_compensation_reversal_rejected',
    'compensation_assignment_provenance_accepted',
    'valid_legacy_refund_not_preserved',
    'invalid_legacy_refund_not_preserved',
    'quarantined_refund_allocation_accepted',
    'quarantined_refund_posting_accepted',
    'customer_chain_accepted',
    'credit_did_not_reduce_receivable',
    'credit_note_ceiling_accepted',
    'credit_note_mutation_accepted',
    'posted_journal_update_accepted',
    'posted_journal_delete_accepted',
    'exact_replay_changed_result',
    'operation_replay_conflict_accepted',
    'stale_version_accepted',
    'void_payment_race_accepted',
    'expense_provenance_accepted',
    'compensation_provenance_accepted',
    'finance_event_rollback_not_atomic',
  ]) {
    assert.match(fixture, new RegExp(proof));
  }
  assert.match(fixture, /private\.p309_replay_receipt\(/u);
  assert.match(fixture, /private\.p309_assert_expected_version\(/u);
  assert.match(fixture, /public\.publish_domain_event\(/u);
  assert.match(fixture, /insert into public\.customer_profiles/u);
  assert.match(
    fixture,
    /insert into public\.invoices \([\s\S]*customer_profile_id[\s\S]*cross-company customer/u,
  );
  const creditAt = fixture.indexOf('insert into public.finance_credit_notes');
  const allocationAt = fixture.indexOf('insert into public.payment_allocations');
  assert.ok(creditAt >= 0 && allocationAt > creditAt);
  assert.match(fixture, /update public\.finance_journals/u);
  assert.match(fixture, /delete from public\.finance_journals/u);
  assert.match(
    fixture,
    /update public\.invoice_lines set vat_minor = 6,[\s\S]*exception when check_violation then if sqlerrm <> 'invoice_line_amounts_forged'/u,
  );
  assert.match(fixture, /p309_task12_concurrency_contract/u);
  assert.match(
    fixture,
    /update public\.pro_company_assignments set status = 'released'[\s\S]*set state = 'reversed'/u,
  );
  assert.match(fixture, /insert into public\.finance_expenses/u);
  assert.match(fixture, /insert into public\.pro_compensations/u);
  assert.match(
    fixture,
    /exists \(select 1 from public\.domain_events[\s\S]*exists \(select 1 from public\.finance_audit_log/u,
  );
});

test('legacy refund migration harness seeds rows before applying P3.09 and asserts classification', () => {
  const harness = source(legacyRefundHarnessPath);
  const applyAt = harness.indexOf('\\ir ../migrations/20260922090000_p309_finance_ledger.sql');
  assert.ok(applyAt > 0);
  assert.ok(harness.indexOf('insert into public.refunds') < applyAt);
  assert.match(harness, /p309_disposable_database/u);
  assert.match(harness, /legacy_currency_mismatch/u);
  assert.match(harness, /ledger_eligible/u);
  assert.match(harness, /valid_legacy_refund_not_classified/u);
  assert.match(harness, /invalid_legacy_refund_not_quarantined/u);
});
