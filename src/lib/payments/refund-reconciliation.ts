export type PendingTapRefundScope = {
  tenantId: string;
  companyId: string;
  refundId: string;
  providerRefundId: string;
};

export type PendingRefundCursor = { createdAt: string; id: string };

type PendingRefundPageRow = { id: string; created_at: string };

export async function drainPendingRefundPages<T extends PendingRefundPageRow>(
  fetchPage: (cursor: PendingRefundCursor | null, limit: number) => Promise<T[]>,
  process: (row: T) => Promise<'updated' | 'unchanged' | 'error'>,
  options: {
    pageSize: number;
    maxPages: number;
    initialCursor?: PendingRefundCursor | null;
  },
): Promise<{
  scanned: number;
  updated: number;
  unchanged: number;
  errors: number;
  nextCursor: PendingRefundCursor | null;
}> {
  const counts = { scanned: 0, updated: 0, unchanged: 0, errors: 0 };
  let cursor: PendingRefundCursor | null = options.initialCursor ?? null;
  let nextCursor = cursor;

  for (let page = 0; page < options.maxPages; page += 1) {
    const rows = await fetchPage(cursor, options.pageSize);
    for (const row of rows) {
      counts.scanned += 1;
      const outcome = await process(row);
      counts[outcome === 'error' ? 'errors' : outcome] += 1;
    }
    const last = rows.at(-1);
    if (!last || rows.length < options.pageSize) {
      nextCursor = null;
      break;
    }
    cursor = { createdAt: last.created_at, id: last.id };
    nextCursor = cursor;
  }

  return { ...counts, nextCursor };
}

type RefundReconciliationDependencies = {
  fetchStatus(providerRefundId: string): Promise<string>;
  reconcile(input: PendingTapRefundScope & { status: 'succeeded' | 'failed' }): Promise<void>;
};

export async function reconcilePendingTapRefund(
  scope: PendingTapRefundScope,
  dependencies: RefundReconciliationDependencies,
): Promise<'updated' | 'unchanged'> {
  const providerStatus = (await dependencies.fetchStatus(scope.providerRefundId)).toUpperCase();
  const status = mapTapRefundStatus(providerStatus);
  if (status === 'pending') return 'unchanged';
  await dependencies.reconcile({ ...scope, status });
  return 'updated';
}

export function mapTapRefundStatus(status: string): 'pending' | 'succeeded' | 'failed' {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
    case 'SUCCEEDED':
    case 'REFUNDED':
      return 'succeeded';
    case 'FAILED':
    case 'DECLINED':
    case 'CANCELLED':
      return 'failed';
    default:
      return 'pending';
  }
}
