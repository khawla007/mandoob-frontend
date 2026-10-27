import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowanceWithAddons,
  checkPlanAllowance,
  consumePlanAllowance,
  periodForCadence,
  type EntitlementSnapshot,
} from './entitlements';

const snapshot: EntitlementSnapshot = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  catalogVersionId: '33333333-3333-4333-8333-333333333333',
  plan: 'starter',
  cadence: 'monthly',
  status: 'active',
  periodStart: '2026-09-01T00:00:00.000Z',
  periodEnd: '2026-10-01T00:00:00.000Z',
  graceUntil: null,
  allowances: {
    employees: 25,
    storageBytes: 100,
    invoices: 50,
    sms: 0,
    whatsapp: 0,
    advancedReports: false,
  },
  addonDeltas: { employees: 25, storageBytes: 50, invoices: 0, sms: 100, whatsapp: 0 },
};

test('allowance checks include add-on deltas and permit the concurrent last unit only once in storage', () => {
  assert.equal(allowanceWithAddons(snapshot, 'employees'), 50);
  assert.deepEqual(checkPlanAllowance(snapshot, 'employees', 49, 1), {
    status: 'allowed',
    remaining: 0,
  });
  assert.deepEqual(checkPlanAllowance(snapshot, 'employees', 50, 1), {
    status: 'limit_reached',
    remaining: 0,
  });
  assert.deepEqual(checkPlanAllowance(snapshot, 'advancedReports', 0, 1), {
    status: 'limit_reached',
    remaining: 0,
  });
});

test('delinquency fails closed after grace while downgrade preserves already-owned data', () => {
  assert.equal(
    checkPlanAllowance(
      { ...snapshot, status: 'past_due', graceUntil: '2026-09-15T00:00:00.000Z' },
      'invoices',
      0,
      1,
      new Date('2026-09-16'),
    ).status,
    'provider_unavailable',
  );
  assert.deepEqual(
    checkPlanAllowance(
      { ...snapshot, allowances: { ...snapshot.allowances, employees: 10 }, addonDeltas: {} },
      'employees',
      25,
      0,
    ),
    { status: 'allowed', remaining: 0 },
  );
  assert.equal(
    checkPlanAllowance({ ...snapshot, status: 'canceled' }, 'invoices', 0, 1).status,
    'provider_unavailable',
  );
});

test('monthly and annual periods use stable UTC anniversary boundaries', () => {
  assert.deepEqual(periodForCadence(new Date('2026-01-31T12:00:00Z'), 'monthly'), {
    start: '2026-01-31T12:00:00.000Z',
    end: '2026-02-28T12:00:00.000Z',
  });
  assert.deepEqual(periodForCadence(new Date('2024-02-29T00:00:00Z'), 'annual'), {
    start: '2024-02-29T00:00:00.000Z',
    end: '2025-02-28T00:00:00.000Z',
  });
});

test('consume requires a stable operation id and delegates one atomic snapshot+usage command', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        data: { status: 'allowed', snapshot_id: snapshot.id, used: 50, limit: 50, replayed: false },
        error: null,
      };
    },
  };
  const result = await consumePlanAllowance(client, {
    tenantId: snapshot.tenantId,
    operationId: '44444444-4444-4444-8444-444444444444',
    allowance: 'invoices',
    amount: 1,
    source: 'invoice',
    sourceId: '55555555-5555-4555-8555-555555555555',
  });
  assert.equal(result.status, 'allowed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, 'p309_consume_plan_allowance');
  assert.throws(
    () =>
      consumePlanAllowance(client, {
        tenantId: snapshot.tenantId,
        operationId: '',
        allowance: 'invoices',
        amount: 1,
        source: 'invoice',
        sourceId: null,
      }),
    /operation/i,
  );
});
