import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { refundOperationFromRow } from '@/lib/data/refund-operation-state';
import { canShowRefundAction } from '@/lib/data/invoice-finance-state';

test('durable pending refund keeps its original payment and command fields', () => {
  const operation = refundOperationFromRow({
    payment_id: '66666666-6666-4666-8666-666666666666',
    idempotency_key: '88888888-8888-4888-8888-888888888888',
    status: 'pending',
    amount_minor: 500,
    reason: 'Duplicate payment',
  });
  assert.deepEqual(operation, {
    paymentId: '66666666-6666-4666-8666-666666666666',
    operationId: '88888888-8888-4888-8888-888888888888',
    status: 'pending',
    amountMinor: 500,
    reason: 'Duplicate payment',
  });
  assert.equal(
    canShowRefundAction({
      detailsAvailable: operation !== null,
      remainingMinor: 0,
      hasPendingRefund: operation?.status === 'pending',
    }),
    true,
  );
});

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
  assert.match(source, /paymentId:\s*hasPendingRefund \? refundOperation\.paymentId : paymentId!/u);
  assert.match(source, /\(hasPendingRefund \|\| paymentId !== null\)/u);
  assert.match(source, /canShowRefundAction\(\{/u);
  assert.match(source, /hasPendingRefund/u);
  assert.match(source, /refundDetailsLoaded/u);
  assert.match(source, /\(canClose \|\| canRefund\) && !hasPendingRefund/u);
  assert.match(source, /<Dialog/u);
  assert.match(source, /useId\(\)/u);
  assert.match(source, /htmlFor=\{`\$\{formId\}-refund-reason`\}/u);
  assert.match(source, /String\(outstandingMinor\)/u);
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
  assert.match(dataSource, /refundDetailsLoaded:\s*true/u);
  assert.match(dataSource, /refundDetailsLoaded:\s*sections\.refundOperation === 'available'/u);
  assert.doesNotMatch(dataSource, /refundAvailable:\s*refundable !== null/u);
  assert.match(tableSource, /refundOperation=\{row\.refundOperation\}/u);
  assert.match(detailSource, /refundOperation=\{invoice\.refundOperation\}/u);
});

test('Tap refund reserves its durable provider effect before any external call', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/payments/actions.ts'),
    'utf8',
  );
  const reserve = source.indexOf('p309_reserve_refund_effect');
  const effect = source.indexOf('createRefund({');
  assert.ok(reserve > -1 && effect > reserve);
  assert.match(source, /providerIdempotencyKey/u);
});
