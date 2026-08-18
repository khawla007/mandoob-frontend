import assert from 'node:assert/strict';
import test from 'node:test';

import { executeIdempotentRefund, type RefundWorkflowDeps } from './refund-workflow';

const input = {
  tenantId: 'tenant-1',
  companyId: 'company-1',
  invoiceId: 'invoice-1',
  actorId: 'actor-1',
  amountMinor: 500,
  reason: 'duplicate charge',
  ip: '127.0.0.1',
  idempotencyKey: 'request-key-1',
};

function deps(overrides: Partial<RefundWorkflowDeps> = {}): RefundWorkflowDeps {
  return {
    prepare: async () => ({
      refundId: 'refund-1',
      paymentId: 'payment-1',
      provider: 'tap',
      providerChargeId: 'charge-1',
      providerIdempotencyKey: 'refund-intent-refund-1',
      status: 'pending',
      currency: 'AED',
    }),
    callProvider: async () => ({ ok: true, providerRefundId: 'tap-refund-1', status: 'succeeded' }),
    reconcile: async () => ({ refundId: 'refund-1', partial: true, status: 'succeeded' }),
    ...overrides,
  };
}

test('local intent persistence failure prevents any provider refund', async () => {
  let providerCalls = 0;
  await assert.rejects(
    executeIdempotentRefund(
      input,
      deps({
        prepare: async () => {
          throw new Error('database unavailable');
        },
        callProvider: async () => {
          providerCalls += 1;
          return { ok: true, providerRefundId: 'never', status: 'succeeded' };
        },
      }),
    ),
    /database unavailable/u,
  );
  assert.equal(providerCalls, 0);
});

test('provider timeout keeps the durable intent retryable with its stable provider key', async () => {
  let reconciliations = 0;
  const seenKeys: string[] = [];
  const result = await executeIdempotentRefund(
    input,
    deps({
      callProvider: async (intent) => {
        seenKeys.push(intent.providerIdempotencyKey);
        return { ok: false, error: 'timeout', retryable: true };
      },
      reconcile: async () => {
        reconciliations += 1;
        return { refundId: 'never', partial: false, status: 'failed' };
      },
    }),
  );
  assert.deepEqual(result, { ok: false, error: 'timeout', retryable: true });
  assert.deepEqual(seenKeys, ['refund-intent-refund-1']);
  assert.equal(reconciliations, 0);
});

test('provider pending response remains pending for durable reconciliation', async () => {
  const result = await executeIdempotentRefund(
    input,
    deps({
      callProvider: async () => ({
        ok: true,
        providerRefundId: 'tap-refund-pending',
        status: 'pending',
      }),
      reconcile: async ({ providerRefundId, status }) => ({
        refundId: providerRefundId!,
        partial: false,
        status,
      }),
    }),
  );
  assert.deepEqual(result, {
    ok: true,
    refundId: 'tap-refund-pending',
    partial: false,
    status: 'pending',
  });
});

test('terminal provider failure is reconciled as failed to release the reserved amount', async () => {
  const reconciled: string[] = [];
  const result = await executeIdempotentRefund(
    input,
    deps({
      callProvider: async () => ({ ok: false, error: 'declined', retryable: false }),
      reconcile: async ({ status }) => {
        reconciled.push(status);
        return { refundId: 'refund-1', partial: false, status };
      },
    }),
  );
  assert.deepEqual(result, { ok: false, error: 'declined', retryable: false });
  assert.deepEqual(reconciled, ['failed']);
});

test('a terminally failed operation never calls the provider again', async () => {
  let providerCalls = 0;
  const result = await executeIdempotentRefund(
    input,
    deps({
      prepare: async () => ({
        refundId: 'refund-1',
        paymentId: 'payment-1',
        provider: 'tap',
        providerChargeId: 'charge-1',
        providerIdempotencyKey: 'refund-intent-refund-1',
        status: 'failed',
        currency: 'AED',
      }),
      callProvider: async () => {
        providerCalls += 1;
        return { ok: true, providerRefundId: 'never', status: 'succeeded' };
      },
    }),
  );
  assert.deepEqual(result, {
    ok: false,
    error: 'Refund operation already failed',
    retryable: false,
  });
  assert.equal(providerCalls, 0);
});

test('retry reuses one intent and provider idempotency key without creating a second refund', async () => {
  const keys: string[] = [];
  const shared = deps({
    callProvider: async (intent) => {
      keys.push(intent.providerIdempotencyKey);
      return keys.length === 1
        ? { ok: false, error: 'timeout', retryable: true }
        : { ok: true, providerRefundId: 'tap-refund-1', status: 'succeeded' };
    },
  });
  await executeIdempotentRefund(input, shared);
  const retried = await executeIdempotentRefund(input, shared);
  assert.deepEqual(keys, ['refund-intent-refund-1', 'refund-intent-refund-1']);
  assert.deepEqual(retried, {
    ok: true,
    refundId: 'refund-1',
    partial: true,
    status: 'succeeded',
  });
});

test('concurrent identical requests converge on one durable intent and stable provider key', async () => {
  const providerKeys: string[] = [];
  const shared = deps({
    callProvider: async (intent) => {
      providerKeys.push(intent.providerIdempotencyKey);
      return { ok: true, providerRefundId: 'tap-refund-1', status: 'succeeded' };
    },
  });
  const results = await Promise.all([
    executeIdempotentRefund(input, shared),
    executeIdempotentRefund(input, shared),
  ]);
  assert.equal(
    results.every((result) => result.ok),
    true,
  );
  assert.deepEqual(new Set(providerKeys), new Set(['refund-intent-refund-1']));
});
