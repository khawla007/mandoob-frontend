import assert from 'node:assert/strict';
import test from 'node:test';
import { persistRefundEffect } from './refund-coordinator';

test('pending provider result is attached durably before success is returned', async () => {
  const calls: string[] = [];
  const result = await persistRefundEffect(
    { status: 'pending', providerRefundId: 'tap-refund-1' },
    {
      attachPending: async () => {
        calls.push('attach');
        return { ok: true, data: { refundId: 'r', status: 'pending', version: 3 } };
      },
      reconcileTerminal: async () => {
        calls.push('terminal');
        throw new Error('not terminal');
      },
    },
  );
  assert.deepEqual(calls, ['attach']);
  assert.deepEqual(result, { ok: true, data: { refundId: 'r', status: 'pending', version: 3 } });
});

test('pending provider result without an identifier fails closed', async () => {
  const result = await persistRefundEffect(
    { status: 'pending', providerRefundId: null },
    {
      attachPending: async () => ({ ok: true, data: {} }),
      reconcileTerminal: async () => ({ ok: true, data: {} }),
    },
  );
  assert.deepEqual(result, { ok: false, code: 'UNAVAILABLE' });
});

test('succeeded Tap result is attached before terminal reconciliation', async () => {
  const calls: string[] = [];
  const result = await persistRefundEffect(
    { status: 'succeeded', providerRefundId: 'tap-refund-2' },
    {
      attachPending: async () => {
        calls.push('attach');
        return { ok: true, data: { refundId: 'r', status: 'pending', version: 4 } };
      },
      reconcileTerminal: async (attached) => {
        assert.ok(attached);
        calls.push(`terminal:${attached.version}`);
        return { ok: true, data: { refundId: 'r', status: 'succeeded', version: 5 } };
      },
    },
  );
  assert.deepEqual(calls, ['attach', 'terminal:4']);
  assert.deepEqual(result, { ok: true, data: { refundId: 'r', status: 'succeeded', version: 5 } });
});

test('attach failure prevents terminal reconciliation and a retry can attach safely', async () => {
  let attempts = 0;
  let terminalCalls = 0;
  const persistence = {
    attachPending: async () => {
      attempts += 1;
      return attempts === 1
        ? ({ ok: false, code: 'UNAVAILABLE' } as const)
        : ({ ok: true, data: { refundId: 'r', status: 'pending', version: 4 } } as const);
    },
    reconcileTerminal: async () => {
      terminalCalls += 1;
      return { ok: true, data: { refundId: 'r', status: 'succeeded', version: 5 } } as const;
    },
  };
  assert.deepEqual(
    await persistRefundEffect(
      { status: 'succeeded', providerRefundId: 'tap-refund-retry' },
      persistence,
    ),
    { ok: false, code: 'UNAVAILABLE' },
  );
  assert.equal(terminalCalls, 0);
  assert.equal(
    (
      await persistRefundEffect(
        { status: 'succeeded', providerRefundId: 'tap-refund-retry' },
        persistence,
      )
    ).ok,
    true,
  );
  assert.equal(terminalCalls, 1);
});
