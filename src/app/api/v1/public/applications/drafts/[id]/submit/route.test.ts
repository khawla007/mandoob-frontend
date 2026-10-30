import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';
process.env.ENCRYPTION_KEY = 'encryption-key-with-enough-length-32chars';

const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'opaque-resume-secret-value-abcdef';

const draftView = {
  draftId: DRAFT_ID,
  version: 2,
  answers: { fullName: 'Aisha Khan', email: 'aisha@example.com', estimate: { reference: 'EST-1' } },
  expiresAt: '2026-09-29T00:00:00.000Z',
  definitionId: '33333333-3333-4333-8333-333333333333',
  definitionVersion: 1,
};

const payload = {
  operationId: '11111111-1111-4111-8111-111111111111',
  expectedVersion: 2,
  consent: { version: 'application-v1', acceptedAt: '2026-09-23T10:00:00.000Z' },
  turnstileToken: 'verified-token',
};

function request(body: unknown = payload, origin = 'https://mandoob.test', token: string | null = TOKEN) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin,
    'content-length': '300',
  };
  if (token) headers['x-resume-token'] = token;
  return new Request(`https://mandoob.test/api/v1/public/applications/drafts/${DRAFT_ID}/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const base = {
  appUrl: 'https://mandoob.test',
  turnstileSecret: 'secret',
  rateLimit: async () => 'allowed' as const,
  verifyTurnstile: async () => true,
  resume: async () => draftView,
  submit: async () => ({
    applicationId: '44444444-4444-4444-8444-444444444444',
    leadId: '55555555-5555-4555-8555-555555555555',
    accepted: true as const,
    deliveryState: 'pending' as const,
  }),
};

test('submits an application and returns truthful pending delivery', async () => {
  const { handleSubmitApplicationPost } = await import('./handler');
  let submitted: { answers?: Record<string, unknown> } | undefined;
  const response = await handleSubmitApplicationPost(request() as never, DRAFT_ID, {
    ...base,
    submit: async (input) => {
      submitted = input;
      return {
        applicationId: '44444444-4444-4444-8444-444444444444',
        leadId: '55555555-5555-4555-8555-555555555555',
        accepted: true,
        deliveryState: 'pending',
      };
    },
  });
  assert.equal(response.status, 202);
  const json = await response.json();
  assert.equal(json.status, 'success');
  assert.equal(json.deliveryState, 'pending');
  assert.equal(json.leadId, '55555555-5555-4555-8555-555555555555');
  assert.equal(submitted?.answers?.fullName, 'Aisha Khan');
});

test('rejects missing token, cross-origin, unresolved draft, stale version, invalid Turnstile, and unready attachments', async () => {
  const { handleSubmitApplicationPost } = await import('./handler');
  const guard = { ...base, submit: async () => { throw new Error('must not persist'); } };
  assert.equal((await handleSubmitApplicationPost(request(payload, 'https://mandoob.test', null) as never, DRAFT_ID, guard)).status, 404);
  assert.equal((await handleSubmitApplicationPost(request(payload, 'https://evil.test') as never, DRAFT_ID, guard)).status, 403);
  assert.equal((await handleSubmitApplicationPost(request() as never, DRAFT_ID, { ...guard, resume: async () => null })).status, 404);
  assert.equal(
    (await handleSubmitApplicationPost(request({ ...payload, expectedVersion: 1 }) as never, DRAFT_ID, guard)).status,
    409,
  );
  assert.equal((await handleSubmitApplicationPost(request() as never, DRAFT_ID, { ...guard, verifyTurnstile: async () => false })).status, 400);
  assert.equal(
    (await handleSubmitApplicationPost(request() as never, DRAFT_ID, {
      ...base,
      submit: async () => { throw new Error('ATTACHMENT_NOT_READY'); },
    })).status,
    409,
  );
});
