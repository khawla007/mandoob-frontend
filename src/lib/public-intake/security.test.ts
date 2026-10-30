import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashOpaqueCredential,
  hashRequest,
  isAllowedPublicOrigin,
  normalizePublicText,
  verifyPublicTurnstile,
} from './security';

test('hashes normalized payloads deterministically and opaque credentials separately', () => {
  assert.equal(hashRequest({ b: 2, a: 1 }), hashRequest({ a: 1, b: 2 }));
  assert.notEqual(hashOpaqueCredential('secret', 'test-pepper-16-bytes'), hashRequest('secret'));
});

test('normalizes controls and neutralizes spreadsheet and HTML injection', () => {
  assert.equal(normalizePublicText('  =SUM(1,2)\u0000 <b>Hello</b>  ', 100), "'=SUM(1,2) Hello");
  assert.throws(() => normalizePublicText('x'.repeat(11), 10), /too long/i);
});

test('requires same-origin public mutations', () => {
  assert.equal(isAllowedPublicOrigin('https://mandoob.test', 'https://mandoob.test'), true);
  assert.equal(isAllowedPublicOrigin('https://evil.test', 'https://mandoob.test'), false);
  assert.equal(isAllowedPublicOrigin(null, 'https://mandoob.test'), false);
});

test('Turnstile binds hostname/action and fails closed on invalid, duplicate, or provider errors', async () => {
  const ok = await verifyPublicTurnstile(
    {
      token: 'token',
      expectedHostname: 'mandoob.test',
      expectedAction: 'contact',
      secret: 'secret',
    },
    {
      fetch: async () =>
        new Response(
          JSON.stringify({ success: true, hostname: 'mandoob.test', action: 'contact' }),
        ),
    },
  );
  assert.equal(ok, true);
  assert.equal(
    await verifyPublicTurnstile(
      {
        token: 'token',
        expectedHostname: 'mandoob.test',
        expectedAction: 'contact',
        secret: 'secret',
      },
      {
        fetch: async () =>
          new Response(JSON.stringify({ success: true, hostname: 'evil.test', action: 'contact' })),
      },
    ),
    false,
  );
  assert.equal(
    await verifyPublicTurnstile(
      {
        token: 'token',
        expectedHostname: 'mandoob.test',
        expectedAction: 'contact',
        secret: 'secret',
      },
      {
        fetch: async () => {
          throw new Error('offline');
        },
      },
    ),
    false,
  );
});
