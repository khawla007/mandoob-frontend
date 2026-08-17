import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

import { ApiError } from '@/lib/errors';

const subject = () => import('./pro-credential-verification');

const actorId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const expectedUpdatedAt = '2026-08-17T11:59:00.000Z';

test('returns stable verification provenance from the atomic RPC', async () => {
  const { verifyProCredentials } = await subject();
  const calls: unknown[] = [];
  const result = await verifyProCredentials(targetId, actorId, expectedUpdatedAt, {
    verify: async (input) => {
      calls.push(input);
      return {
        data: {
          credentials_verified: true,
          verified_at: '2026-08-17T12:00:00Z',
          verified_by_profile_id: actorId,
          changed: true,
        },
        error: null,
      };
    },
  });
  assert.deepEqual(calls, [{ actorId, targetId, expectedUpdatedAt }]);
  assert.deepEqual(result, {
    verifiedAt: '2026-08-17T12:00:00Z',
    verifiedByProfileId: actorId,
    changed: true,
  });
});

test('maps RPC readiness and authorization errors without leaking details', async () => {
  const { verifyProCredentials } = await subject();
  for (const [message, code, status] of [
    ['PRO_LICENSE_MISSING', 'PRO_LICENSE_MISSING', 409],
    ['PRO_NOT_READY', 'PRO_NOT_READY', 409],
    ['STALE_CREDENTIALS', 'STALE_CREDENTIALS', 409],
    ['OPERATOR_FORBIDDEN', 'FORBIDDEN', 403],
    ['database secret', 'INTERNAL', 500],
  ] as const) {
    await assert.rejects(
      () =>
        verifyProCredentials(targetId, actorId, expectedUpdatedAt, {
          verify: async () => ({ data: null, error: { message } }),
        }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === code &&
        error.status === status &&
        !error.message.includes('database secret'),
    );
  }
});

test('rejects a malformed expected version before calling the RPC', async () => {
  const { verifyProCredentials } = await subject();
  let called = false;
  await assert.rejects(
    () =>
      verifyProCredentials(targetId, actorId, 'not-a-timestamp', {
        verify: async () => {
          called = true;
          return { data: null, error: null };
        },
      }),
    /Invalid/u,
  );
  assert.equal(called, false);
});
