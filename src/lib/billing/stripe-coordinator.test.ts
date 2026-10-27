import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runStripeEffect, type StripeIntent } from './stripe-coordinator';

const reserved = (): StripeIntent => ({
  operationId: crypto.randomUUID(),
  effectKey: 'effect',
  effectToken: crypto.randomUUID(),
  providerPriceId: 'price_exact',
  state: 'reserved',
  providerReference: null,
  redirectUrl: null,
});

test('reserves before one provider effect and attaches it', async () => {
  const calls: string[] = [];
  const result = await runStripeEffect({
    reserve: async () => {
      calls.push('reserve');
      return reserved();
    },
    create: async () => {
      calls.push('provider');
      return { ok: true, effect: { reference: 'cs_1', url: 'https://checkout.stripe.com/x' } };
    },
    attach: async (intent, effect) => {
      calls.push('attach');
      return {
        ...intent,
        state: 'attached',
        providerReference: effect.reference,
        redirectUrl: effect.url,
      };
    },
    markUnknown: async () => {
      calls.push('unknown');
    },
  });
  assert.deepEqual(calls, ['reserve', 'provider', 'attach']);
  assert.equal(result.ok, true);
});

test('replay returns attached effect without provider call', async () => {
  let effects = 0;
  const intent = { ...reserved(), state: 'attached' as const, providerReference: 'cs_1' };
  const result = await runStripeEffect({
    reserve: async () => intent,
    create: async () => {
      effects += 1;
      throw new Error('must not run');
    },
    attach: async () => intent,
    markUnknown: async () => {},
  });
  assert.equal(effects, 0);
  assert.deepEqual(result, { ok: true, reference: 'cs_1', redirectUrl: null, replayed: true });
});

test('provider ambiguity is fenced for recovery', async () => {
  let unknown = false;
  const result = await runStripeEffect({
    reserve: async () => reserved(),
    create: async () => ({ ok: false, retryable: true, code: 'PROVIDER_UNAVAILABLE' }),
    attach: async () => {
      throw new Error('must not run');
    },
    markUnknown: async () => {
      unknown = true;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(unknown, true);
});
