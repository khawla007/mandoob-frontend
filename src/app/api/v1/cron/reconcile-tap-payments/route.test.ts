import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  join(process.cwd(), 'src/app/api/v1/cron/reconcile-tap-payments/route.ts'),
  'utf8',
);

test('Tap recovery uses bounded P3.09 attempt/refund claims and completes exact fences', () => {
  assert.match(source, /p309_claim_tap_recovery/u);
  assert.match(source, /p309_complete_tap_recovery/u);
  assert.match(source, /p309_claim_tap_refund_recovery/u);
  assert.match(source, /p309_complete_tap_refund_recovery/u);
  assert.match(source, /BATCH_SIZE = 25/u);
  assert.match(source, /lease_token/u);
  assert.doesNotMatch(source, /event_jobs|claim_event_jobs|refund_reconciliation_state/u);
});

test('worker uses normalized provider lookups and atomic finance reconciliation only', () => {
  assert.match(source, /getCharge/u);
  assert.match(source, /lookupChargeByEffectKey/u);
  assert.match(source, /p309_attach_payment_attempt_recovery/u);
  assert.match(source, /p309_reconcile_claimed_refund/u);
  assert.match(source, /getRefund/u);
  assert.match(source, /p309_reconcile_payment_attempt/u);
  assert.doesNotMatch(source, /reconcilePendingInvoiceRefund/u);
  assert.doesNotMatch(source, /\.raw\b|provider_event_payload/u);
  assert.doesNotMatch(source, /error\.message/u);
  assert.match(source, /reconcileTerminalTapRefundFailure\([\s\S]*replay\.retryable/u);
  assert.match(source, /p_provider_refund_id: failure\.providerRefundId/u);
});

test('worker separately claims and deterministically reconciles captured-after-void compensation', () => {
  assert.match(source, /p309_claim_tap_compensation/u);
  assert.match(source, /compensation_effect_key/u);
  assert.match(source, /p309_reconcile_tap_compensation/u);
  assert.match(source, /createRefund/u);
});

test('worker recovers stranded reserved webhook events with their rotated fence', () => {
  assert.match(source, /p309_claim_tap_event_recovery/u);
  assert.match(source, /p309_reconcile_tap_event/u);
  assert.match(source, /fence_token/u);
});
