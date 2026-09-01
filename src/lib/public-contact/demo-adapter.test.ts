import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { ContactSubmissionResult, NormalizedContactPayload } from './contracts';
import {
  createSyntheticContactAdapter,
  productionContactAdapter,
  SYNTHETIC_CONTACT_NOTICE,
} from './demo-adapter';

const payload: NormalizedContactPayload = {
  fullName: 'Amina Noor',
  email: 'amina@example.com',
  phone: '+971501234567',
  subject: 'company_setup',
  message: 'Please help me set up my company.',
  consent: true,
};

test('production adapter honestly reports unavailable without claiming a send', async () => {
  const result = await productionContactAdapter.submit(payload);
  assert.deepEqual(result, {
    status: 'unavailable',
    sent: false,
    message: 'Contact delivery is not available yet. No message was sent.',
  });
});

test('synthetic adapters expose every result discriminant with safe user-facing data', async () => {
  const statuses = ['success', 'duplicate', 'rate_limited', 'failure', 'unavailable'] as const;
  const results: ContactSubmissionResult[] = [];

  for (const status of statuses) {
    results.push(await createSyntheticContactAdapter(status).submit(payload));
  }

  assert.deepEqual(
    results.map((result) => result.status),
    statuses,
  );
  for (const result of results) {
    assert.equal(result.sent, false);
    assert.match(result.message, /no message was sent/i);
    assert.equal(result.synthetic, true);
    assert.equal(result.notice, SYNTHETIC_CONTACT_NOTICE);
  }
  const rateLimited = results[2];
  assert.equal(rateLimited.status, 'rate_limited');
  if (rateLimited.status === 'rate_limited') assert.equal(rateLimited.retryAfterSeconds, 60);
  const failure = results[3];
  assert.equal(failure.status, 'failure');
  if (failure.status === 'failure') assert.equal(failure.retryable, true);
});

test('synthetic and production adapters are deterministic and do not mutate submissions', async () => {
  const original = structuredClone(payload);

  for (const status of [
    'success',
    'duplicate',
    'rate_limited',
    'failure',
    'unavailable',
  ] as const) {
    const adapter = createSyntheticContactAdapter(status);
    assert.deepEqual(await adapter.submit(payload), await adapter.submit(payload));
  }
  assert.deepEqual(
    await productionContactAdapter.submit(payload),
    await productionContactAdapter.submit(payload),
  );
  assert.deepEqual(payload, original);
});

test('adapter source has no I/O, server action, provider, timer, random, or notification path', () => {
  const source = readFileSync(new URL('./demo-adapter.ts', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1]);
  assert.deepEqual(imports, ['./contracts'], 'adapter may only import its pure type contract');

  const forbidden: Array<[string, RegExp]> = [
    ['fetch', /\bfetch\s*\(/u],
    ['Supabase', /supabase/iu],
    ['server action directive', /['"]use server['"]/u],
    [
      'email/SMS/WhatsApp/provider import',
      /from\s+['"][^'"]*(?:email|sms|whatsapp|nodemailer|resend|twilio|provider)[^'"]*['"]/iu,
    ],
    ['timer', /\b(?:setTimeout|setInterval|queueMicrotask)\s*\(/u],
    ['randomness', /\b(?:Math\.random|crypto\.(?:randomUUID|getRandomValues))\s*\(/u],
    [
      'network call',
      /\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon|network|http|https)\b/iu,
    ],
    ['database call', /\b(?:database|db|client)\.\w+\s*\(/iu],
    ['notification call', /\b(?:notify|sendNotification|notification\.\w+)\s*\(/iu],
    ['filesystem write', /\b(?:writeFile|appendFile|createWriteStream)\s*\(/u],
  ];

  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(source, pattern, label);
  }
});
