import assert from 'node:assert/strict';
import test from 'node:test';

import { drainPendingRefundPages, reconcilePendingTapRefund } from './refund-reconciliation';

const scope = {
  tenantId: 'tenant-1',
  companyId: 'company-1',
  refundId: 'refund-1',
  providerRefundId: 'tap-refund-1',
};

test('completed Tap refunds reconcile through the exact tenant-company intent', async () => {
  const reconciliations: unknown[] = [];
  const outcome = await reconcilePendingTapRefund(scope, {
    fetchStatus: async () => 'COMPLETED',
    reconcile: async (input) => {
      reconciliations.push(input);
    },
  });
  assert.equal(outcome, 'updated');
  assert.deepEqual(reconciliations, [
    { ...scope, status: 'succeeded', providerRefundId: 'tap-refund-1' },
  ]);
});

test('pending Tap refunds remain durable without a premature ledger transition', async () => {
  let reconciliations = 0;
  const outcome = await reconcilePendingTapRefund(scope, {
    fetchStatus: async () => 'PENDING',
    reconcile: async () => {
      reconciliations += 1;
    },
  });
  assert.equal(outcome, 'unchanged');
  assert.equal(reconciliations, 0);
});

test('terminal Tap refund failure releases the exact company reservation', async () => {
  const statuses: string[] = [];
  const outcome = await reconcilePendingTapRefund(scope, {
    fetchStatus: async () => 'FAILED',
    reconcile: async ({ status }) => {
      statuses.push(status);
    },
  });
  assert.equal(outcome, 'updated');
  assert.deepEqual(statuses, ['failed']);
});

test('refund polling advances beyond fifty unchanged rows without starving later intents', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: `refund-${String(index).padStart(3, '0')}`,
    created_at: '2026-08-18T00:00:00.000Z',
  }));
  const visited: string[] = [];
  const result = await drainPendingRefundPages(
    async (cursor, limit) => {
      const start = cursor ? rows.findIndex((row) => row.id === cursor.id) + 1 : 0;
      return rows.slice(start, start + limit);
    },
    async (row) => {
      visited.push(row.id);
      return row.id === 'refund-100' ? 'updated' : 'unchanged';
    },
    { pageSize: 50, maxPages: 5 },
  );

  assert.equal(result.scanned, 101);
  assert.equal(result.unchanged, 100);
  assert.equal(result.updated, 1);
  assert.equal(visited.at(-1), 'refund-100');
});

test('persisted refund cursor reaches rows beyond one capped run and wraps safely', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: `refund-${String(index).padStart(4, '0')}`,
    created_at: '2026-08-18T00:00:00.000Z',
  }));
  const visited: string[] = [];
  const fetchPage = async (cursor: { id: string } | null, limit: number) => {
    const start = cursor ? rows.findIndex((row) => row.id === cursor.id) + 1 : 0;
    return rows.slice(start, start + limit);
  };
  const process = async (row: (typeof rows)[number]) => {
    visited.push(row.id);
    return 'unchanged' as const;
  };

  const first = await drainPendingRefundPages(fetchPage, process, {
    pageSize: 50,
    maxPages: 20,
    initialCursor: null,
  });
  assert.equal(first.scanned, 1000);
  assert.equal(first.nextCursor?.id, 'refund-0999');

  const second = await drainPendingRefundPages(fetchPage, process, {
    pageSize: 50,
    maxPages: 20,
    initialCursor: first.nextCursor,
  });
  assert.equal(second.scanned, 1);
  assert.equal(visited.at(-1), 'refund-1000');
  assert.equal(second.nextCursor, null);

  const wrapped = await drainPendingRefundPages(fetchPage, process, {
    pageSize: 1,
    maxPages: 1,
    initialCursor: second.nextCursor,
  });
  assert.equal(wrapped.nextCursor?.id, 'refund-0000');
});
