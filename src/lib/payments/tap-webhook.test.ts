import assert from 'node:assert/strict';
import test from 'node:test';
import { computeTapHashstring } from './signature';
import {
  normalizeTapWebhookPayload,
  processTapWebhook,
  verifyTapWebhookPayload,
} from './tap-webhook';

const raw = Buffer.from('{"id":"chg-1","amount":"10.00","currency":"AED","status":"CAPTURED"}');

test('official AED payload verifies canonical raw fields and preserves millisecond created time', () => {
  const payload = Buffer.from(
    JSON.stringify({
      id: 'chg-official',
      event_id: 'evt-official',
      amount: 125,
      currency: 'AED',
      status: 'CAPTURED',
      merchant: { id: 'acct-1' },
      reference: { gateway: 'gw-1', payment: 'pay-1' },
      transaction: { created: 1714900000000 },
    }),
  );
  const signature = computeTapHashstring(
    {
      id: 'chg-official',
      amount: '125.00',
      currency: 'AED',
      gatewayReference: 'gw-1',
      paymentReference: 'pay-1',
      status: 'CAPTURED',
      created: '1714900000000',
    },
    'whsec',
  );
  assert.equal(verifyTapWebhookPayload(payload, signature, 'whsec'), true);
  assert.deepEqual(normalizeTapWebhookPayload(payload, null), {
    eventId: 'evt-official',
    chargeId: 'chg-official',
    accountId: 'acct-1',
    metadataAccountId: null,
    amountMinor: 12500,
    currency: 'AED',
    status: 'CAPTURED',
    occurredAt: '2024-05-05T09:06:40.000Z',
  });
});

test('raw bytes are verified after exact destination resolution and metadata is only cross-checked', async () => {
  const calls: string[] = [];
  const result = await processTapWebhook(
    { rawBody: raw, signature: 'sig', destination: 'dst-1' },
    {
      resolveDestination: async () => ({ accountId: 'acct-1', secret: 'secret' }),
      verify: (bytes) => {
        calls.push(bytes === raw ? 'raw' : 'changed');
        return true;
      },
      parse: () => ({
        eventId: 'evt-1',
        chargeId: 'chg-1',
        accountId: 'acct-1',
        amountMinor: 1000,
        currency: 'AED',
        status: 'CAPTURED',
        metadataAccountId: 'acct-1',
      }),
      reserveEvent: async () => {
        calls.push('reserve');
        return { reserved: true, token: 'fence' };
      },
      reconcile: async () => {
        calls.push('reconcile');
        return 'updated';
      },
    },
  );
  assert.deepEqual(result, { accepted: true });
  assert.deepEqual(calls, ['raw', 'reserve', 'reconcile']);
});

test('unknown destination, bad signature, duplicate and wrong account receive uniform ack', async () => {
  const base = {
    resolveDestination: async () => ({ accountId: 'acct-1', secret: 'secret' }),
    verify: () => true,
    parse: () => ({
      eventId: 'evt-1',
      chargeId: 'chg-1',
      accountId: 'acct-1',
      amountMinor: 1000,
      currency: 'AED',
      status: 'CAPTURED',
      metadataAccountId: 'acct-1',
    }),
    reserveEvent: async () => ({ reserved: true as const, token: 'fence' }),
    reconcile: async () => 'updated' as const,
  };
  const cases = [
    { ...base, resolveDestination: async () => null },
    { ...base, verify: () => false },
    { ...base, reserveEvent: async () => ({ reserved: false as const }) },
    { ...base, parse: () => ({ ...base.parse(), accountId: 'wrong' }) },
  ];
  for (const deps of cases)
    assert.deepEqual(
      await processTapWebhook({ rawBody: raw, signature: 'sig', destination: 'dst-1' }, deps),
      { accepted: true },
    );
});

test('amount currency and charge mismatches, terminal staleness, and stale fence do not mutate', async () => {
  for (const mismatch of ['amount', 'currency', 'charge', 'terminal', 'fence'] as const) {
    let reconciled = 0;
    const result = await processTapWebhook(
      { rawBody: raw, signature: 'sig', destination: 'dst-1' },
      {
        resolveDestination: async () => ({ accountId: 'acct-1', secret: 'secret' }),
        verify: () => true,
        parse: () => ({
          eventId: `evt-${mismatch}`,
          chargeId: 'chg-1',
          accountId: 'acct-1',
          amountMinor: 1000,
          currency: 'AED',
          status: 'CAPTURED',
          metadataAccountId: 'acct-1',
        }),
        reserveEvent: async () => ({ reserved: true, token: 'fence' }),
        reconcile: async () => {
          reconciled += 1;
          return mismatch === 'terminal' ? 'stale' : mismatch === 'fence' ? 'fenced' : 'mismatch';
        },
      },
    );
    assert.deepEqual(result, { accepted: true });
    assert.equal(reconciled, 1);
  }
});
