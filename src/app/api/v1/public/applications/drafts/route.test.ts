import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';
process.env.ENCRYPTION_KEY = 'encryption-key-with-enough-length-32chars';

const body = {
  operationId: '11111111-1111-4111-8111-111111111111',
  definitionKey: 'company-registration',
  turnstileToken: 'verified-token',
};

function request(payload: unknown = body, origin = 'https://mandoob.test') {
  return new Request('https://mandoob.test/api/v1/public/applications/drafts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'content-length': '200' },
    body: JSON.stringify(payload),
  });
}

const base = {
  appUrl: 'https://mandoob.test',
  turnstileSecret: 'secret',
  rateLimit: async () => 'allowed' as const,
  verifyTurnstile: async () => true,
  create: async () => ({
    draftId: '22222222-2222-4222-8222-222222222222',
    version: 1,
    expiresAt: '2026-09-29T00:00:00.000Z',
    resumeSecret: 'opaque-resume-secret-value-abcdef',
  }),
};

test('creates a draft and returns the one-time resume secret', async () => {
  const { handleCreateDraftPost } = await import('./handler');
  const response = await handleCreateDraftPost(request() as never, base);
  assert.equal(response.status, 201);
  const json = await response.json();
  assert.equal(json.status, 'success');
  assert.equal(json.draftId, '22222222-2222-4222-8222-222222222222');
  assert.equal(json.version, 1);
  assert.equal(json.resumeSecret, 'opaque-resume-secret-value-abcdef');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rejects cross-origin, oversized, limited, invalid Turnstile, and unknown definitions', async () => {
  const { handleCreateDraftPost } = await import('./handler');
  const guard = { ...base, create: async () => { throw new Error('must not persist'); } };
  assert.equal((await handleCreateDraftPost(request(body, 'https://evil.test') as never, guard)).status, 403);
  const oversized = request();
  oversized.headers.set('content-length', '9000');
  assert.equal((await handleCreateDraftPost(oversized as never, guard)).status, 413);
  assert.equal((await handleCreateDraftPost(request() as never, { ...guard, rateLimit: async () => 'limited' })).status, 429);
  assert.equal((await handleCreateDraftPost(request() as never, { ...guard, verifyTurnstile: async () => false })).status, 400);
  assert.equal(
    (await handleCreateDraftPost(request() as never, {
      ...base,
      create: async () => { throw new Error('DEFINITION_UNAVAILABLE'); },
    })).status,
    404,
  );
});
