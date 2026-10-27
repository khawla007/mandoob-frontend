import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  allocateManualPayment,
  allocateReviewedBankPayment,
  approveCompensation,
  approveExpense,
  attachPendingInvoiceRefund,
  createCompensationDraft,
  createExpenseDraft,
  createInvoiceDraft,
  financePhaseOperationId,
  finalizeInvoice,
  getInvoiceRefundResult,
  listCompanyFinanceCosts,
  postCompensation,
  postExpense,
  prepareInvoiceRefund,
  reconcileClaimedInvoiceRefund,
  reconcileInvoiceRefund,
  reverseCompensation,
  reverseExpense,
  voidInvoice,
  type FinanceRpcClient,
} from './repository';

const ids = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  companyId: '22222222-2222-4222-8222-222222222222',
  customerId: '33333333-3333-4333-8333-333333333333',
  actorId: '44444444-4444-4444-8444-444444444444',
  invoiceId: '55555555-5555-4555-8555-555555555555',
  paymentId: '66666666-6666-4666-8666-666666666666',
  refundId: '77777777-7777-4777-8777-777777777777',
  operationId: '88888888-8888-4888-8888-888888888888',
  expenseId: '99999999-9999-4999-8999-999999999999',
  compensationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  proProfileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  journalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  evidenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

const line = {
  description: 'Government filing',
  quantity: 1,
  unitAmountMinor: 10_000,
  discountMinor: 0,
  taxCategory: 'standard' as const,
  taxBasis: 'exclusive' as const,
  vatBasisPoints: 500,
  currency: 'AED',
};

function client(result: unknown = { invoiceId: ids.invoiceId, version: 1, replayed: false }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc: FinanceRpcClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: result, error: null };
    },
  };
  return { rpc, calls };
}

const scope = { tenantId: ids.tenantId, companyId: ids.companyId, actorId: ids.actorId };
const meta = { operationId: ids.operationId, expectedVersion: 0 };

test('provider reconciliation derives a stable distinct operation UUID', () => {
  const derived = financePhaseOperationId(ids.operationId, 'reconcile');
  assert.match(derived, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.notEqual(derived, ids.operationId);
  assert.equal(financePhaseOperationId(ids.operationId, 'reconcile'), derived);
});

test('durable refund result is parsed from the service-only recovery RPC', async () => {
  const fake = client({
    invoiceId: ids.invoiceId,
    paymentId: ids.paymentId,
    refundId: ids.refundId,
    partial: true,
    status: 'failed',
    version: 4,
    replayed: true,
  });
  const result = await getInvoiceRefundResult(fake.rpc, ids.refundId);
  assert.equal(result.ok, true);
  assert.deepEqual(fake.calls, [
    { name: 'p309_get_refund_result', args: { p_refund_id: ids.refundId } },
  ]);
});

test('fenced terminal provider rejection reconciles without inventing a provider reference', async () => {
  const fake = client({
    invoiceId: ids.invoiceId,
    paymentId: ids.paymentId,
    refundId: ids.refundId,
    partial: true,
    status: 'failed',
    version: 4,
    replayed: false,
  });
  const result = await reconcileClaimedInvoiceRefund(fake.rpc, {
    refundId: ids.refundId,
    providerRefundId: null,
    status: 'failed',
    workerId: ids.actorId,
    leaseToken: ids.operationId,
  });
  assert.equal(result.ok, true);
  assert.equal(fake.calls[0]?.args.p_provider_refund_id, null);
});

test('repository maps every lifecycle command to one service-role RPC with derived scope', async () => {
  const fake = client();
  await createInvoiceDraft(fake.rpc, {
    ...scope,
    ...meta,
    customerProfileId: ids.customerId,
    label: 'Filing',
    dueDate: '2026-10-31',
    lines: [line],
  });
  await finalizeInvoice(fake.rpc, { ...scope, ...meta, invoiceId: ids.invoiceId });
  await allocateManualPayment(fake.rpc, {
    ...scope,
    ...meta,
    invoiceId: ids.invoiceId,
    amountMinor: 5_000,
    method: 'bank_transfer',
    note: 'first half',
  });
  await allocateReviewedBankPayment(fake.rpc, {
    ...scope,
    ...meta,
    invoiceId: ids.invoiceId,
    evidenceSubmissionId: ids.evidenceId,
    amountMinor: 5_000,
    note: 'reviewed transfer',
  });
  await voidInvoice(fake.rpc, { ...scope, ...meta, invoiceId: ids.invoiceId, reason: 'Cancelled' });
  await prepareInvoiceRefund(fake.rpc, {
    ...scope,
    ...meta,
    invoiceId: ids.invoiceId,
    paymentId: ids.paymentId,
    amountMinor: 1_000,
    reason: 'Duplicate charge',
  });
  await reconcileInvoiceRefund(fake.rpc, {
    ...scope,
    ...meta,
    invoiceId: ids.invoiceId,
    paymentId: ids.paymentId,
    refundId: ids.refundId,
    providerRefundId: null,
    status: 'succeeded',
  });
  await attachPendingInvoiceRefund(fake.rpc, {
    ...scope,
    ...meta,
    invoiceId: ids.invoiceId,
    paymentId: ids.paymentId,
    refundId: ids.refundId,
    providerRefundId: 'tap-refund-1',
  });

  assert.deepEqual(
    fake.calls.map((call) => call.name),
    [
      'p309_create_invoice_draft',
      'p309_finalize_invoice',
      'p309_allocate_manual_payment',
      'p309_allocate_reviewed_bank_payment',
      'p309_void_invoice',
      'p309_prepare_refund',
      'p309_reconcile_refund',
      'p309_attach_pending_refund',
    ],
  );
  for (const call of fake.calls) {
    assert.equal(call.args.p_tenant_id, ids.tenantId);
    assert.equal(call.args.p_company_id, ids.companyId);
    assert.equal(call.args.p_actor_id, ids.actorId);
    assert.equal(call.args.p_operation_id, ids.operationId);
    assert.equal(call.args.p_expected_version, 0);
    assert.match(String(call.args.p_payload_hash), /^[a-f0-9]{64}$/u);
    assert.equal('p_ip' in call.args, false);
  }
  assert.deepEqual(fake.calls[0]?.args.p_lines, [line]);
  assert.equal(fake.calls[2]?.args.p_amount_minor, 5_000);
  assert.equal(fake.calls[3]?.args.p_submission_id, ids.evidenceId);
});

test('operation payload identity excludes aggregate version but retains the business payload', async () => {
  const fake = client();
  await prepareInvoiceRefund(fake.rpc, {
    ...scope,
    ...meta,
    invoiceId: ids.invoiceId,
    paymentId: ids.paymentId,
    amountMinor: 1_000,
    reason: 'Retryable refund',
  });
  await prepareInvoiceRefund(fake.rpc, {
    ...scope,
    ...meta,
    expectedVersion: 9,
    invoiceId: ids.invoiceId,
    paymentId: ids.paymentId,
    amountMinor: 1_000,
    reason: 'Retryable refund',
  });
  await prepareInvoiceRefund(fake.rpc, {
    ...scope,
    ...meta,
    expectedVersion: 9,
    invoiceId: ids.invoiceId,
    paymentId: ids.paymentId,
    amountMinor: 999,
    reason: 'Retryable refund',
  });
  assert.equal(fake.calls[0]?.args.p_payload_hash, fake.calls[1]?.args.p_payload_hash);
  assert.notEqual(fake.calls[1]?.args.p_payload_hash, fake.calls[2]?.args.p_payload_hash);
  assert.equal(fake.calls[1]?.args.p_expected_version, 9);
});

test('repository returns exact replay receipts and sanitizes stale/provider failures', async () => {
  const replay = client({ invoiceId: ids.invoiceId, version: 1, replayed: true });
  assert.deepEqual(
    await finalizeInvoice(replay.rpc, { ...scope, ...meta, invoiceId: ids.invoiceId }),
    {
      ok: true,
      data: { invoiceId: ids.invoiceId, version: 1, replayed: true },
    },
  );

  for (const [error, code] of [
    [{ code: '40001', message: 'STALE_VERSION relation private.secret' }, 'STALE_VERSION'],
    [{ code: '23505', message: 'OPERATION_REUSED raw payload' }, 'OPERATION_REUSED'],
    [{ code: '23514', message: 'COMPENSATION_AMOUNT_CONFLICT raw payload' }, 'CONFLICT'],
    [{ code: 'P0001', message: 'owned invoice absent' }, 'NOT_FOUND'],
    [{ code: 'XX000', message: 'password=secret' }, 'UNAVAILABLE'],
  ] as const) {
    const failing: FinanceRpcClient = { rpc: async () => ({ data: null, error }) };
    const result = await finalizeInvoice(failing, { ...scope, ...meta, invoiceId: ids.invoiceId });
    assert.deepEqual(result, { ok: false, code });
    assert.equal('error' in result, false);
  }
});

test('repository rejects malformed RPC receipts without exposing their contents', async () => {
  const malformed = client({ invoiceId: 'not-a-uuid', version: 'private row', replayed: false });
  assert.deepEqual(
    await finalizeInvoice(malformed.rpc, { ...scope, ...meta, invoiceId: ids.invoiceId }),
    { ok: false, code: 'UNAVAILABLE' },
  );
});

test('repository rejects malformed provider refund intent fields', async () => {
  for (const malformed of [
    { provider: 'tap', providerChargeId: null, providerIdempotencyKey: 'key', currency: 'AED' },
    { provider: 'tap', providerChargeId: 'charge', providerIdempotencyKey: '', currency: 'AED' },
    { provider: 'manual', providerChargeId: null, providerIdempotencyKey: 'key', currency: 'aed' },
  ]) {
    const fake = client({
      invoiceId: ids.invoiceId,
      paymentId: ids.paymentId,
      refundId: ids.refundId,
      version: 1,
      replayed: false,
      status: 'pending',
      ...malformed,
    });
    assert.deepEqual(
      await prepareInvoiceRefund(fake.rpc, {
        ...scope,
        ...meta,
        invoiceId: ids.invoiceId,
        paymentId: ids.paymentId,
        amountMinor: 100,
        reason: 'test refund',
      }),
      { ok: false, code: 'UNAVAILABLE' },
    );
  }
});

test('repository maps expense and compensation lifecycles to scoped command RPCs', async () => {
  const fake = client({
    expenseId: ids.expenseId,
    compensationId: ids.compensationId,
    journalId: ids.journalId,
    version: 1,
    state: 'draft',
    replayed: false,
  });

  await createExpenseDraft(fake.rpc, {
    ...scope,
    ...meta,
    sourceReference: 'supplier-invoice-1',
    description: 'Annual filing expense',
    amountMinor: 10_000,
    currency: 'AED',
  });
  await approveExpense(fake.rpc, { ...scope, ...meta, expenseId: ids.expenseId });
  await postExpense(fake.rpc, {
    ...scope,
    ...meta,
    expenseId: ids.expenseId,
    settlementAccount: 'bank_clearing',
  });
  await reverseExpense(fake.rpc, {
    ...scope,
    ...meta,
    expenseId: ids.expenseId,
    reason: 'Supplier credit note received',
  });
  await createCompensationDraft(fake.rpc, {
    ...scope,
    ...meta,
    proProfileId: ids.proProfileId,
    sourceReference: 'registration-1',
    amountMinor: 10_000,
    currency: 'AED',
  });
  await approveCompensation(fake.rpc, {
    ...scope,
    ...meta,
    compensationId: ids.compensationId,
  });
  await postCompensation(fake.rpc, {
    ...scope,
    ...meta,
    compensationId: ids.compensationId,
  });
  await reverseCompensation(fake.rpc, {
    ...scope,
    ...meta,
    compensationId: ids.compensationId,
    reason: 'Duplicate registration adjustment',
  });

  assert.deepEqual(
    fake.calls.map((call) => call.name),
    [
      'p309_create_expense_draft',
      'p309_approve_expense',
      'p309_post_expense',
      'p309_reverse_expense',
      'p309_create_compensation_draft',
      'p309_approve_compensation',
      'p309_post_compensation',
      'p309_reverse_compensation',
    ],
  );
  for (const call of fake.calls) {
    assert.equal(call.args.p_tenant_id, ids.tenantId);
    assert.equal(call.args.p_company_id, ids.companyId);
    assert.equal(call.args.p_actor_id, ids.actorId);
    assert.equal(call.args.p_operation_id, ids.operationId);
    assert.equal(call.args.p_expected_version, 0);
    assert.match(String(call.args.p_payload_hash), /^[a-f0-9]{64}$/u);
  }
  assert.equal(fake.calls[0]?.args.p_amount_minor, 10_000);
  assert.equal(fake.calls[2]?.args.p_settlement_account, 'bank_clearing');
  assert.equal(fake.calls[4]?.args.p_pro_profile_id, ids.proProfileId);
});

test('repository exposes journal-derived cost reads and rejects malformed document receipts', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const readClient: FinanceRpcClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: {
          rows: [
            {
              journalId: ids.journalId,
              sourceKind: 'expense',
              sourceId: ids.expenseId,
              amountMinor: 10_000,
              currency: 'AED',
              accountingAt: '2026-10-09T00:00:00.000Z',
            },
          ],
          total: 1,
          limit: 50,
        },
        error: null,
      };
    },
  };
  const result = await listCompanyFinanceCosts(readClient, { ...scope, limit: 50 });
  assert.equal(result.ok, true);
  assert.equal(calls[0]?.name, 'p309_list_company_finance_costs');
  assert.deepEqual(calls[0]?.args, {
    p_tenant_id: ids.tenantId,
    p_company_id: ids.companyId,
    p_actor_id: ids.actorId,
    p_before_accounting_at: null,
    p_before_id: null,
    p_limit: 50,
  });

  const malformed = client({
    expenseId: ids.expenseId,
    version: 1,
    state: 'posted',
    journalId: 'private table contents',
    replayed: false,
  });
  assert.deepEqual(
    await postExpense(malformed.rpc, {
      ...scope,
      ...meta,
      expenseId: ids.expenseId,
      settlementAccount: 'cash_clearing',
    }),
    { ok: false, code: 'UNAVAILABLE' },
  );
});

test('command migration is fixed-search-path, service-only, replay-safe, versioned and fully scoped', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260922091000_p309_finance_commands.sql'),
    'utf8',
  );
  const ledgerSql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260922090000_p309_finance_ledger.sql'),
    'utf8',
  );
  for (const name of [
    'p309_create_invoice_draft',
    'p309_finalize_invoice',
    'p309_allocate_manual_payment',
    'p309_void_invoice',
    'p309_prepare_refund',
    'p309_reconcile_refund',
    'p309_attach_pending_refund',
    'p309_reconcile_pending_refund',
    'p309_list_company_invoices',
    'p309_list_customer_invoices',
    'p309_create_expense_draft',
    'p309_approve_expense',
    'p309_post_expense',
    'p309_reverse_expense',
    'p309_create_compensation_draft',
    'p309_approve_compensation',
    'p309_post_compensation',
    'p309_reverse_compensation',
    'p309_list_company_finance_costs',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${name}\\(`, 'u'));
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`,
        'u',
      ),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`, 'u'),
    );
  }
  assert.doesNotMatch(sql, /set search_path\s*=\s*pg_catalog\s*,\s*public/iu);
  assert.match(sql, /private\.p309_replay_receipt/iu);
  assert.match(sql, /private\.p309_assert_expected_version/iu);
  assert.match(sql, /pro_company_assignments/iu);
  assert.match(sql, /customer_profiles/iu);
  assert.match(sql, /order by[\s\S]*created_at desc[\s\S]*id desc/iu);
  assert.match(sql, /count\(\*\)/iu);
  assert.doesNotMatch(sql, /offset\s+\(?.*p_page/iu);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*p_operation_id/iu);
  assert.match(sql, /profile\.status\s*=\s*'active'/iu);
  assert.match(sql, /refund\.status\s+in\s*\('pending','succeeded'\)/iu);
  assert.match(sql, /invoice\.status\s*<>\s*'draft'/iu);
  assert.match(sql, /refund_contra_revenue[\s\S]*vat_payable[\s\S]*cash_clearing|bank_clearing/iu);
  assert.match(sql, /revoke all on function public\.create_company_invoice/iu);
  assert.match(sql, /revoke all on function public\.reconcile_company_refund/iu);
  assert.match(sql, /create index[\s\S]*tenant_id[\s\S]*company_id[\s\S]*created_at[\s\S]*id/iu);
  assert.doesNotMatch(sql, /p_view='billed'[\s\S]{0,300}invoice\.created_at/iu);
  assert.match(sql, /from public\.payment_allocations[\s\S]*invoice_id=p_invoice_id/iu);
  assert.match(sql, /from public\.refund_allocations[\s\S]*invoice_id=p_invoice_id/iu);
  assert.match(sql, /v_currency\s*:=\s*p_lines->0->>'currency'/iu);
  assert.match(sql, /if v_total<=0 then raise exception[\s\S]*VALIDATION_FAILED/iu);
  const reconcile = sql.match(
    /create function public\.p309_reconcile_refund\([\s\S]*?\n\$\$;/u,
  )?.[0];
  const reconcileCore = sql.match(
    /create function private\.p309_reconcile_refund_core\([\s\S]*?\n\$\$;/u,
  )?.[0];
  const recovery = sql.match(
    /create function public\.p309_reconcile_pending_refund\([\s\S]*?\n\$\$;/u,
  )?.[0];
  assert.ok(reconcile && reconcileCore && recovery);
  for (const body of [reconcileCore, recovery]) {
    assert.match(
      body,
      /from public\.invoices[^;]*for update;[\s\S]*from public\.payments[^;]*for update;[\s\S]*from public\.refunds[^;]*for update;/u,
    );
  }
  assert.match(reconcile, /p309_assert_pro_finance_scope/u);
  assert.match(reconcile, /private\.p309_reconcile_refund_core\([\s\S]*false/u);
  assert.doesNotMatch(reconcile, /p_service_recovery/u);
  assert.doesNotMatch(recovery, /p309_assert_pro_finance_scope/u);
  assert.match(recovery, /select actor_id[\s\S]*finance_operation_receipts/u);
  assert.match(recovery, /private\.p309_reconcile_refund_core\([\s\S]*true/u);
  assert.doesNotMatch(recovery, /public\.p309_reconcile_refund/u);
  assert.match(
    sql,
    /revoke all on function private\.p309_reconcile_refund_core\([\s\S]*service_role/u,
  );
  assert.match(sql, /insert into public\.finance_credit_notes/u);
  assert.match(
    sql,
    /from public\.pro_assignment_term_links link[\s\S]*link\.compensation_term_id/u,
  );
  assert.match(sql, /'finance\.expense\.posted'[\s\S]*private\.p309_publish_event/u);
  assert.match(sql, /'finance\.compensation\.posted'[\s\S]*private\.p309_publish_event/u);
  assert.match(sql, /'expense_reversal'[\s\S]*v_settlement[\s\S]*'expense'/u);
  assert.match(sql, /'compensation_reversal'[\s\S]*'pro_compensation_payable'[\s\S]*'expense'/u);
  assert.match(
    sql,
    /source_kind in \('expense','expense_reversal','compensation','compensation_reversal'\)/u,
  );
  assert.match(
    sql,
    /when journal\.source_kind in \('expense_reversal','compensation_reversal'\)[\s\S]*then -pg_catalog\.sum/u,
  );
  assert.match(sql, /'version',1,'state','draft'/u);
  assert.match(
    sql,
    /p_tenant_id::text[\s\S]*p_company_id::text[\s\S]*p_actor_id::text[\s\S]*p_operation_id::text/u,
  );
  assert.match(ledgerSql, /pro_compensations_source_unique/u);
  assert.match(ledgerSql, /source_reference_normalized/u);
  assert.match(sql, /COMPENSATION_SOURCE_CONFLICT/u);
  assert.match(
    sql,
    /'credit_note'[\s\S]*'refund_contra_revenue'[\s\S]*'vat_payable'[\s\S]*'receivable'/u,
  );
  assert.match(sql, /'cash_refund'[\s\S]*'receivable'[\s\S]*(?:'cash_clearing'|'bank_clearing')/u);
});
