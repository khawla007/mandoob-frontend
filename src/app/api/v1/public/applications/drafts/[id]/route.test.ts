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
  answers: { fullName: 'Aisha Khan' },
  expiresAt: '2026-09-29T00:00:00.000Z',
  definitionId: '33333333-3333-4333-8333-333333333333',
  definitionVersion: 1,
};

function getRequest(token: string | null = TOKEN) {
  const headers: Record<string, string> = {};
  if (token) headers['x-resume-token'] = token;
  return new Request(`https://mandoob.test/api/v1/public/applications/drafts/${DRAFT_ID}`, {
    method: 'GET',
    headers,
  });
}

function patchRequest(payload: unknown, origin = 'https://mandoob.test', token: string | null = TOKEN) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin,
    'content-length': '200',
  };
  if (token) headers['x-resume-token'] = token;
  return new Request(`https://mandoob.test/api/v1/public/applications/drafts/${DRAFT_ID}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
}

const savePayload = {
  operationId: '11111111-1111-4111-8111-111111111111',
  expectedVersion: 2,
  answers: { fullName: 'Aisha Khan', email: 'aisha@example.com' },
};

test('resumes a draft with a valid resume token and never returns the secret', async () => {
  const { handleResumeDraftGet } = await import('./handler');
  const response = await handleResumeDraftGet(getRequest() as never, DRAFT_ID, {
    rateLimit: async () => 'allowed',
    resume: async () => draftView,
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.version, 2);
  assert.deepEqual(json.answers, { fullName: 'Aisha Khan' });
  assert.equal('resumeSecret' in json, false);
  assert.equal('resume_secret_hash' in json, false);
});

test('returns 404 for a missing token or an unresolved draft', async () => {
  const { handleResumeDraftGet } = await import('./handler');
  assert.equal(
    (await handleResumeDraftGet(getRequest(null) as never, DRAFT_ID, { rateLimit: async () => 'allowed', resume: async () => draftView })).status,
    404,
  );
  assert.equal(
    (await handleResumeDraftGet(getRequest() as never, DRAFT_ID, { rateLimit: async () => 'allowed', resume: async () => null })).status,
    404,
  );
});

test('saves an autosave with matching version', async () => {
  const { handleSaveDraftPatch } = await import('./handler');
  let received: unknown;
  const response = await handleSaveDraftPatch(patchRequest(savePayload) as never, DRAFT_ID, {
    appUrl: 'https://mandoob.test',
    rateLimit: async () => 'allowed',
    save: async (input) => {
      received = input;
      return { draftId: DRAFT_ID, version: 3, saved: true };
    },
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.version, 3);
  assert.equal((received as { resumeSecret: string }).resumeSecret, TOKEN);
});

test('rejects cross-origin, missing token, oversized, and stale-version saves', async () => {
  const { handleSaveDraftPatch } = await import('./handler');
  const base = {
    appUrl: 'https://mandoob.test',
    rateLimit: async () => 'allowed' as const,
    save: async () => ({ draftId: DRAFT_ID, version: 3, saved: true as const }),
  };
  assert.equal((await handleSaveDraftPatch(patchRequest(savePayload, 'https://evil.test') as never, DRAFT_ID, base)).status, 403);
  assert.equal((await handleSaveDraftPatch(patchRequest(savePayload, 'https://mandoob.test', null) as never, DRAFT_ID, base)).status, 404);
  const oversized = patchRequest(savePayload);
  oversized.headers.set('content-length', '99999');
  assert.equal((await handleSaveDraftPatch(oversized as never, DRAFT_ID, base)).status, 413);
  assert.equal(
    (await handleSaveDraftPatch(patchRequest(savePayload) as never, DRAFT_ID, {
      ...base,
      save: async () => { throw new Error('VERSION_CONFLICT'); },
    })).status,
    409,
  );
});
