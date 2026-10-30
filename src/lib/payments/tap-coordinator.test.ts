import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRedirectState,
  runTapCharge,
  runTapRefund,
  verifyPaymentReturnState,
  verifyRedirectState,
  type DurableTapIntent,
} from './tap-coordinator';

const intent: DurableTapIntent = {
  operationId: '11111111-1111-4111-8111-111111111111',
  effectKey: 'p309-charge-11111111-1111-4111-8111-111111111111',
  payloadHash: 'a'.repeat(64),
  state: 'reserved',
  providerReference: null,
  redirectUrl: null,
  amountMinor: 600,
  currency: 'AED',
};

test('provider effect uses the authoritative reserved collectible and rejects changed durable intent', async () => {
  let sent: [number, string] | null = null;
  const result = await runTapCharge(
    { operationId: intent.operationId, payloadHash: intent.payloadHash },
    {
      reserve: async () => intent,
      createEffect: async (reserved) => {
        sent = [reserved.amountMinor, reserved.currency];
        return {
          kind: 'created',
          providerReference: 'chg-authoritative',
          redirectUrl: 'https://tap/pay',
        };
      },
      lookupEffect: async () => null,
      persistEffect: async () => ({
        ...intent,
        amountMinor: 1000,
        state: 'attached',
        providerReference: 'chg-authoritative',
      }),
      reconcile: async (attached) => attached,
    },
  );
  assert.deepEqual(sent, [600, 'AED']);
  assert.deepEqual(result, { ok: false, code: 'UNAVAILABLE', retryable: true });
});

test('concurrent duplicate starts share one reservation and stable provider key', async () => {
  let creates = 0;
  const attached = {
    ...intent,
    state: 'attached' as const,
    providerReference: 'chg-1',
    redirectUrl: 'https://tap/1',
  };
  const deps = {
    reserve: async () => intent,
    createEffect: async (value: DurableTapIntent) => {
      creates += 1;
      assert.equal(value.effectKey, intent.effectKey);
      return { kind: 'created' as const, providerReference: 'chg-1', redirectUrl: 'https://tap/1' };
    },
    lookupEffect: async () => null,
    persistEffect: async () => attached,
    reconcile: async () => ({ ...attached, state: 'reconciled' as const }),
  };
  const one = await runTapCharge(
    { operationId: intent.operationId, payloadHash: intent.payloadHash },
    deps,
  );
  const two = await runTapCharge(
    { operationId: intent.operationId, payloadHash: intent.payloadHash },
    { ...deps, reserve: async () => ({ ...attached, state: 'reconciled' as const }) },
  );
  assert.equal(creates, 1);
  assert.deepEqual(one, { ok: true, redirectUrl: 'https://tap/1', replayed: false });
  assert.deepEqual(two, { ok: true, redirectUrl: 'https://tap/1', replayed: true });
});

test('actual payment return binding rejects invoice and operation substitution', () => {
  const state = createRedirectState(
    { operationId: intent.operationId, invoiceId: 'invoice-1', expiresAt: 2_000 },
    'redirect-secret',
  );
  assert.equal(
    verifyPaymentReturnState(state, 'redirect-secret', {
      invoiceId: 'invoice-1',
      operationId: intent.operationId,
      now: 1_999,
    }),
    true,
  );
  assert.equal(
    verifyPaymentReturnState(state, 'redirect-secret', {
      invoiceId: 'invoice-2',
      operationId: intent.operationId,
      now: 1_999,
    }),
    false,
  );
  assert.equal(
    verifyPaymentReturnState(state, 'redirect-secret', {
      invoiceId: 'invoice-1',
      operationId: '22222222-2222-4222-8222-222222222222',
      now: 1_999,
    }),
    false,
  );
});

test('a concurrent Promise barrier permits exactly one provider effect owner', async () => {
  let reservations = 0;
  let creates = 0;
  let lookups = 0;
  let releaseEffect!: (effect: { providerReference: string; redirectUrl: string }) => void;
  const effectReady = new Promise<{ providerReference: string; redirectUrl: string }>((resolve) => {
    releaseEffect = resolve;
  });
  const reserve = async () => ({ ...intent, ownsEffect: reservations++ === 0 });
  const dependencies = {
    reserve,
    createEffect: async () => {
      creates += 1;
      const effect = { providerReference: 'chg-only-once', redirectUrl: 'https://tap/once' };
      releaseEffect(effect);
      return { kind: 'created' as const, ...effect };
    },
    lookupEffect: async () => (lookups++ === 0 ? null : effectReady),
    persistEffect: async (
      value: DurableTapIntent,
      effect: { providerReference: string; redirectUrl: string | null },
    ) => ({
      ...value,
      state: 'attached' as const,
      providerReference: effect.providerReference,
      redirectUrl: effect.redirectUrl,
    }),
    reconcile: async (value: DurableTapIntent) => ({ ...value, state: 'reconciled' as const }),
  };
  const [first, second] = await Promise.all([
    runTapCharge(
      { operationId: intent.operationId, payloadHash: intent.payloadHash },
      dependencies,
    ),
    runTapCharge(
      { operationId: intent.operationId, payloadHash: intent.payloadHash },
      dependencies,
    ),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(creates, 1);
});

test('same operation with changed payload fails before provider effect', async () => {
  let effects = 0;
  const result = await runTapCharge(
    { operationId: intent.operationId, payloadHash: 'b'.repeat(64) },
    {
      reserve: async () => {
        throw Object.assign(new Error('OPERATION_REUSED'), { code: 'OPERATION_REUSED' });
      },
      createEffect: async () => {
        effects += 1;
        throw new Error('unreachable');
      },
      lookupEffect: async () => null,
      persistEffect: async () => intent,
      reconcile: async () => intent,
    },
  );
  assert.deepEqual(result, { ok: false, code: 'OPERATION_REUSED', retryable: false });
  assert.equal(effects, 0);
});

test('ambiguous timeout looks up the durable key and recovers provider success', async () => {
  const calls: string[] = [];
  let lookups = 0;
  const result = await runTapCharge(
    { operationId: intent.operationId, payloadHash: intent.payloadHash },
    {
      reserve: async () => intent,
      createEffect: async () => ({ kind: 'unknown' as const }),
      lookupEffect: async (key) => {
        calls.push(`lookup:${key}`);
        return lookups++ === 0
          ? null
          : { providerReference: 'chg-timeout', redirectUrl: 'https://tap/recovered' };
      },
      persistEffect: async (_reserved, effect) => {
        calls.push(`attach:${effect.providerReference}`);
        return {
          ...intent,
          state: 'attached',
          providerReference: effect.providerReference,
          redirectUrl: effect.redirectUrl,
        };
      },
      reconcile: async (attached) => {
        calls.push('reconcile');
        return { ...attached, state: 'reconciled' };
      },
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    `lookup:${intent.effectKey}`,
    `lookup:${intent.effectKey}`,
    'attach:chg-timeout',
    'reconcile',
  ]);
});

test('provider success followed by attach failure is safely retried by lookup', async () => {
  let creates = 0;
  let attaches = 0;
  let lookups = 0;
  const deps = {
    reserve: async () => intent,
    createEffect: async () => {
      creates += 1;
      return {
        kind: 'created' as const,
        providerReference: 'chg-attach',
        redirectUrl: 'https://tap/attach',
      };
    },
    lookupEffect: async () =>
      lookups++ === 0
        ? null
        : { providerReference: 'chg-attach', redirectUrl: 'https://tap/attach' },
    persistEffect: async (
      _reserved: DurableTapIntent,
      effect: { providerReference: string; redirectUrl: string | null },
    ) => {
      attaches += 1;
      if (attaches === 1) throw new Error('private db failure password=secret');
      return {
        ...intent,
        state: 'attached' as const,
        providerReference: effect.providerReference,
        redirectUrl: effect.redirectUrl,
      };
    },
    reconcile: async (attached: DurableTapIntent) => ({
      ...attached,
      state: 'reconciled' as const,
    }),
  };
  assert.deepEqual(
    await runTapCharge({ operationId: intent.operationId, payloadHash: intent.payloadHash }, deps),
    {
      ok: false,
      code: 'UNAVAILABLE',
      retryable: true,
    },
  );
  const recovered = await runTapCharge(
    { operationId: intent.operationId, payloadHash: intent.payloadHash },
    { ...deps, createEffect: async () => ({ kind: 'unknown' as const }) },
  );
  assert.equal(recovered.ok, true);
  assert.equal(creates, 1);
});

test('redirect state is authenticated, scoped and expiring', () => {
  const state = createRedirectState(
    { operationId: intent.operationId, invoiceId: 'invoice-1', expiresAt: 2_000 },
    'redirect-secret',
  );
  assert.equal(verifyRedirectState(state, 'redirect-secret', 1_999)?.invoiceId, 'invoice-1');
  assert.equal(verifyRedirectState(`${state.slice(0, -1)}x`, 'redirect-secret', 1_999), null);
  assert.equal(verifyRedirectState(state, 'redirect-secret', 2_001), null);
});

test('refund coordinator performs prepare/effect/attach/reconcile and recovers pending lookup', async () => {
  const calls: string[] = [];
  const prepared = { ...intent, effectKey: 'p309-refund-1' };
  const result = await runTapRefund(
    { operationId: intent.operationId, payloadHash: intent.payloadHash },
    {
      reserve: async () => prepared,
      createEffect: async () => ({ kind: 'unknown' as const }),
      lookupEffect: async () => ({
        providerReference: 're-1',
        redirectUrl: null,
        status: 'succeeded' as const,
      }),
      persistEffect: async (_value, effect) => {
        calls.push('attach');
        return { ...prepared, providerReference: effect.providerReference, state: 'attached' };
      },
      reconcile: async (value, status) => {
        calls.push(`reconcile:${status}`);
        return { ...value, state: 'reconciled' };
      },
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['attach', 'reconcile:succeeded']);
});

test('pending unknown refund remains attached and retry never creates a second provider refund', async () => {
  let durable = { ...intent, effectKey: 'p309-refund-unknown' };
  let creates = 0;
  const deps = {
    reserve: async () => durable,
    lookupEffect: async () => null,
    createEffect: async () => {
      creates += 1;
      return {
        kind: 'created' as const,
        providerReference: 'refund-unknown',
        redirectUrl: null,
        status: 'pending' as const,
      };
    },
    persistEffect: async (_value: DurableTapIntent, effect: { providerReference: string }) => {
      durable = { ...durable, state: 'attached', providerReference: effect.providerReference };
      return durable;
    },
    reconcile: async (value: DurableTapIntent) => value,
  };
  const start = { operationId: intent.operationId, payloadHash: intent.payloadHash };
  assert.equal((await runTapRefund(start, deps)).ok, true);
  assert.equal((await runTapRefund(start, deps)).ok, true);
  assert.equal(creates, 1);
  assert.equal(durable.state, 'attached');
});

test('retryable and terminal provider failures are sanitized', async () => {
  const recorded: boolean[] = [];
  for (const [retryable, expected] of [
    [true, true],
    [false, false],
  ] as const) {
    const result = await runTapRefund(
      { operationId: intent.operationId, payloadHash: intent.payloadHash },
      {
        reserve: async () => intent,
        createEffect: async () => ({
          kind: 'failed' as const,
          retryable,
          code: 'provider secret payload',
        }),
        lookupEffect: async () => null,
        persistEffect: async () => intent,
        reconcile: async () => intent,
        recordFailure: async () => {
          recorded.push(retryable);
        },
      },
    );
    assert.deepEqual(result, { ok: false, code: 'PROVIDER_FAILED', retryable: expected });
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
  assert.deepEqual(recorded, [false]);
});
