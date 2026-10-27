import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  runCreateInvoiceAction,
  runFinalizeInvoiceAction,
  runManualPaymentAction,
  runVoidInvoiceAction,
  type ProFinanceActionDependencies,
} from './action-logic';

const ID = '11111111-1111-4111-8111-111111111111';
const actionSource = readFileSync(
  join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/payments/actions.ts'),
  'utf8',
);
function setup(overrides: Partial<ProFinanceActionDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: ProFinanceActionDependencies = {
    authorize: async () => ({ tenantId: ID, companyId: ID, actorId: ID, tenantSlug: 'acme' }),
    createDraft: async () => ({ ok: true, data: { invoiceId: ID, version: 0, replayed: false } }),
    finalize: async () => ({ ok: true, data: { invoiceId: ID, version: 1, replayed: false } }),
    allocate: async () => ({
      ok: true,
      data: { invoiceId: ID, paymentId: ID, version: 2, replayed: false },
    }),
    voidInvoice: async () => ({ ok: true, data: { invoiceId: ID, version: 2, replayed: false } }),
    revalidate: (path) => calls.push(path),
    ...overrides,
  };
  return { dependencies, calls };
}

test('create draft accepts immutable lines and revalidates only after a committed receipt', async () => {
  let received: unknown;
  const ctx = setup({
    createDraft: async (input) => {
      received = input;
      return { ok: true, data: { invoiceId: ID, version: 0, replayed: false } };
    },
  });
  const result = await runCreateInvoiceAction(
    'acme',
    {
      operationId: ID,
      customerProfileId: ID,
      label: 'Filing',
      dueDate: '2026-10-31',
      lines: [
        {
          description: 'Filing',
          quantity: 1,
          unitAmountMinor: 1000,
          discountMinor: 0,
          taxCategory: 'standard',
          taxBasis: 'exclusive',
          vatBasisPoints: 500,
          currency: 'AED',
        },
      ],
    },
    ctx.dependencies,
  );
  assert.equal(result.ok, true);
  assert.equal((received as Record<string, unknown>).companyId, ID);
  assert.equal((received as Record<string, unknown>).customerProfileId, ID);
  assert.equal('tenantSlug' in (received as Record<string, unknown>), false);
  assert.deepEqual(ctx.calls, [
    '/t/acme/payments',
    `/t/acme/payments/${ID}`,
    '/t/acme/payments/analytics',
    '/t/acme/company',
    '/t/acme/dashboard',
    '/t/acme/finance',
    '/t/acme/portal/payments',
    `/t/acme/portal/payments/${ID}`,
  ]);
});

test('create draft forwards the explicitly selected customer when multiple links are available', async () => {
  const customerIds = [
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ];
  const received: string[] = [];
  const ctx = setup({
    createDraft: async (input) => {
      assert.ok(input.customerProfileId);
      received.push(input.customerProfileId);
      return { ok: true, data: { invoiceId: ID, version: 0, replayed: false } };
    },
  });

  for (const customerProfileId of customerIds) {
    const result = await runCreateInvoiceAction(
      'acme',
      {
        operationId: ID,
        customerProfileId,
        label: 'Filing',
        dueDate: null,
        lines: [
          {
            description: 'Filing',
            quantity: 1,
            unitAmountMinor: 1000,
            discountMinor: 0,
            taxCategory: 'standard',
            taxBasis: 'inclusive',
            vatBasisPoints: 500,
            currency: 'AED',
          },
        ],
      },
      ctx.dependencies,
    );
    assert.equal(result.ok, true);
  }

  assert.deepEqual(received, customerIds);
});

test('finalize, partial allocation and void forward versions/operations and sanitize failures', async () => {
  const captured: unknown[] = [];
  const ctx = setup({
    finalize: async (input) => {
      captured.push(input);
      return { ok: true, data: { invoiceId: ID, version: 3, replayed: false } };
    },
    allocate: async (input) => {
      captured.push(input);
      return { ok: true, data: { invoiceId: ID, paymentId: ID, version: 4, replayed: false } };
    },
    voidInvoice: async (input) => {
      captured.push(input);
      return { ok: false, code: 'STALE_VERSION' };
    },
  });
  assert.equal(
    (
      await runFinalizeInvoiceAction(
        { tenantSlug: 'acme', invoiceId: ID, expectedVersion: 2, operationId: ID },
        ctx.dependencies,
      )
    ).ok,
    true,
  );
  assert.equal(
    (
      await runManualPaymentAction(
        {
          tenantSlug: 'acme',
          invoiceId: ID,
          expectedVersion: 3,
          operationId: ID,
          amountMinor: 500,
          method: 'cash',
        },
        ctx.dependencies,
      )
    ).ok,
    true,
  );
  assert.deepEqual(
    await runVoidInvoiceAction(
      {
        tenantSlug: 'acme',
        invoiceId: ID,
        expectedVersion: 4,
        operationId: ID,
        reason: 'Cancelled',
      },
      ctx.dependencies,
    ),
    { ok: false, code: 'STALE_VERSION' },
  );
  assert.equal(ctx.calls.length, 16);
  assert.equal((captured[1] as Record<string, unknown>).amountMinor, 500);
  assert.equal((captured[2] as Record<string, unknown>).expectedVersion, 4);
});

test('authorization and repository exceptions never expose raw provider or SQL text', async () => {
  for (const overrides of [
    {
      authorize: async () => {
        throw new Error('relation private.invoices password=secret');
      },
    },
    {
      finalize: async () => {
        throw new Error('Tap raw response card=4111');
      },
    },
  ]) {
    const ctx = setup(overrides);
    const result = await runFinalizeInvoiceAction(
      { tenantSlug: 'acme', invoiceId: ID, expectedVersion: 0, operationId: ID },
      ctx.dependencies,
    );
    assert.deepEqual(result, { ok: false, code: 'UNAVAILABLE' });
    assert.equal(ctx.calls.length, 0);
  }
});

test('invalid command bodies return validation failure after authorization', async () => {
  const ctx = setup();
  assert.deepEqual(
    await runFinalizeInvoiceAction(
      { tenantSlug: 'acme', invoiceId: 'invalid', expectedVersion: -1, operationId: 'invalid' },
      ctx.dependencies,
    ),
    { ok: false, code: 'VALIDATION_FAILED' },
  );
  assert.deepEqual(
    await runCreateInvoiceAction(
      'acme',
      { operationId: ID, label: 'Missing customer', dueDate: null, lines: [] },
      ctx.dependencies,
    ),
    { ok: false, code: 'VALIDATION_FAILED' },
  );
});

test('bank evidence actions bind authorization to tenant/company and allocation uses reviewed RPC', () => {
  assert.match(actionSource, /allocateReviewedBankPayment\(createSupabaseServiceRoleClient\(\)/u);
  assert.match(actionSource, /parsed\.tenantId !== authority\.tenantId/u);
  assert.match(actionSource, /parsed\.companyId !== authority\.companyId/u);
  assert.match(actionSource, /openBankEvidence\(\{/u);
  assert.match(actionSource, /reviewBankEvidence\(\{/u);
  assert.match(actionSource, /lifetimeSeconds: z\.number\(\)\.int\(\)\.min\(1\)\.max\(300\)/u);
});

test('refund action durably persists provider effects before success and never returns provider details', () => {
  assert.match(actionSource, /prepareInvoiceRefund\(client, input\)/u);
  assert.match(actionSource, /runTapRefund\(/u);
  assert.match(actionSource, /p309_attach_refund_effect_recovery/u);
  assert.match(actionSource, /attachPendingInvoiceRefund\(client/u);
  assert.match(actionSource, /financePhaseOperationId\(input\.operationId, 'attach'\)/u);
  assert.match(actionSource, /reconcileClaimedInvoiceRefund\(client/u);
  assert.match(actionSource, /workerId: refundWorkerId/u);
  assert.match(actionSource, /leaseToken/u);
  assert.doesNotMatch(actionSource, /result\.error|error\.message|providerChargeId:\s*reconciled/u);
});

test('refund action rate-limits before reservation and binds the original charge destination account', () => {
  assert.match(actionSource, /consumeSensitiveRateLimit/u);
  assert.match(actionSource, /financialEffect/u);
  assert.match(actionSource, /payment_provider_attempts/u);
  assert.match(actionSource, /tap_provider_destinations/u);
  assert.match(actionSource, /merchantId/u);
});

test('refund production path uses the durable Tap coordinator instead of a parallel effect runner', () => {
  assert.match(actionSource, /runTapRefund/u);
  assert.match(actionSource, /recordFailure:/u);
  assert.match(actionSource, /reconcileTerminalTapRefundFailure\(false/u);
  assert.doesNotMatch(actionSource, /persistRefundEffect/u);
  assert.doesNotMatch(actionSource, /async function refundEffect/u);
});
