import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';

const payload = {
  operationId: '11111111-1111-4111-8111-111111111111',
  turnstileToken: 'verified-token',
  contact: {
    fullName: 'Aisha Khan',
    email: 'aisha@example.com',
    phone: '+971501234567',
    subject: 'company_setup',
    message: 'Please help with company setup.',
    consent: true,
  },
};

function request(body: unknown = payload, origin = 'https://mandoob.test') {
  return new Request('https://mandoob.test/api/v1/public/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'content-length': '500' },
    body: JSON.stringify(body),
  });
}

test('accepts normalized contact truth while returning truthful pending delivery', async () => {
  const { handlePublicContactPost } = await import('./handler');
  let accepted: Record<string, unknown> | undefined;
  const response = await handlePublicContactPost(request() as never, {
    appUrl: 'https://mandoob.test',
    turnstileSecret: 'secret',
    rateLimit: async () => 'allowed',
    verifyTurnstile: async () => true,
    accept: async (input) => {
      accepted = input;
      return { contactId: crypto.randomUUID(), accepted: true, deliveryState: 'pending' };
    },
  });
  assert.equal(response.status, 202);
  assert.equal(accepted?.operationId, payload.operationId);
  const body = await response.json();
  assert.equal(body.status, 'success');
  assert.equal(body.sent, false);
  assert.equal(body.deliveryState, 'pending');
  assert.match(body.message, /accepted/i);
});

test('rejects cross-origin, oversized, limited, and invalid Turnstile requests before persistence', async () => {
  const { handlePublicContactPost } = await import('./handler');
  const base = {
    appUrl: 'https://mandoob.test',
    turnstileSecret: 'secret',
    rateLimit: async () => 'allowed' as const,
    verifyTurnstile: async () => true,
    accept: async () => { throw new Error('must not persist'); },
  };
  assert.equal((await handlePublicContactPost(request(payload, 'https://evil.test') as never, base)).status, 403);
  const oversized = request();
  oversized.headers.set('content-length', '20000');
  assert.equal((await handlePublicContactPost(oversized as never, base)).status, 413);
  assert.equal(
    (await handlePublicContactPost(request() as never, { ...base, rateLimit: async () => 'limited' })).status,
    429,
  );
  assert.equal(
    (await handlePublicContactPost(request() as never, { ...base, verifyTurnstile: async () => false })).status,
    400,
  );
});
