import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('refund UI keeps one operation UUID across retries and releases terminal submissions', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/pro/InvoiceActions.tsx'), 'utf8');
  assert.match(source, /useRef<string \| null>\(null\)/u);
  assert.match(source, /refundOperationId\.current \?\?= crypto\.randomUUID\(\)/u);
  assert.match(source, /operationId: refundOperationId\.current/u);
  assert.match(source, /refundOperationId\.current = null/u);
  assert.match(source, /result\.code === 'TAP_TERMINAL'[\s\S]*refundOperationId\.current = null/u);
  assert.match(
    source,
    /result\.data\.status === 'succeeded'[\s\S]*refundOperationId\.current = null/u,
  );
  assert.match(source, /result\.data\.status === 'pending'[\s\S]*paymentRefundPending/u);
  assert.match(source, /useEffect\([\s\S]*syncRefundOperationId/u);
  assert.match(source, /refundOperation\?\.status === 'pending'/u);
  assert.match(source, /paymentRetryRefund/u);
  assert.match(source, /canShowRefundAction\(\{/u);
  assert.match(source, /hasPendingRefund/u);
  assert.match(source, /refundAvailable/u);
  assert.match(source, /\(canClose \|\| canRefund\) && !hasPendingRefund/u);
  assert.match(source, /<Dialog/u);
  assert.match(source, /htmlFor="refund-reason"/u);
  assert.match(source, /paymentConfirmRefund/u);
  assert.match(source, /min-h-11/u);
});

test('invoice reads pass the latest durable refund operation to every action surface', () => {
  const dataSource = readFileSync(join(process.cwd(), 'src/lib/data/invoices.ts'), 'utf8');
  const tableSource = readFileSync(
    join(process.cwd(), 'src/components/pro/InvoicesTable.tsx'),
    'utf8',
  );
  const detailSource = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/payments/[invoiceId]/page.tsx'),
    'utf8',
  );
  assert.match(dataSource, /idempotency_key, status, amount_minor, reason, created_at/u);
  assert.match(dataSource, /refundOperation:/u);
  assert.match(tableSource, /refundOperation=\{row\.refundOperation\}/u);
  assert.match(detailSource, /refundOperation=\{invoice\.refundOperation\}/u);
});
