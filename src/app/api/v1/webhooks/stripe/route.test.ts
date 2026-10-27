import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');

test('Stripe route verifies raw body before any event handling', () => {
  const raw = source.indexOf('await req.text()');
  const verify = source.indexOf('verifyWebhookSignature(rawBody');
  const handle = source.indexOf('handleVerifiedStripeEvent(event');
  assert.ok(raw >= 0 && verify > raw && handle > verify);
  assert.doesNotMatch(source.slice(0, verify), /req\.json\(/u);
});

test('Stripe route persists via service-only atomic RPCs and emits sanitized failures', () => {
  assert.match(source, /p309_reserve_stripe_event/u);
  assert.match(source, /p309_apply_stripe_subscription_event/u);
  assert.doesNotMatch(source, /tenant_payment_config/u);
  assert.doesNotMatch(source, /enqueueEmail/u);
  assert.doesNotMatch(source, /error\.message/u);
});
