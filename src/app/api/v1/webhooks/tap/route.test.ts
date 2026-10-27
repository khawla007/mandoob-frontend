import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/app/api/v1/webhooks/tap/route.ts'), 'utf8');

test('Tap route resolves destination before raw-byte verification and atomic reconciliation', () => {
  assert.ok(source.indexOf('resolveDestination:') < source.indexOf('verify:'));
  assert.match(source, /req\.arrayBuffer\(\)/u);
  assert.match(source, /searchParams\.get\('destination'\)/u);
  assert.match(source, /\.eq\('id', value\)/u);
  assert.match(source, /p309_reserve_tap_event/u);
  assert.match(source, /p309_reconcile_tap_event/u);
  assert.match(source, /verifyTapWebhookPayload/u);
  assert.match(source, /normalizeTapWebhookPayload/u);
  assert.doesNotMatch(source, /toFixed\(3\)|numeric \* 1000/u);
  assert.doesNotMatch(source, /\.from\('payments'\)|\.from\('invoices'\)/u);
});

test('Tap route always returns the same non-leaking acknowledgement', () => {
  assert.match(source, /NextResponse\.json\(\{ accepted: true \}, \{ status: 202 \}\)/u);
  assert.doesNotMatch(source, /error\.message|tenant_id missing|invalid signature/u);
});
