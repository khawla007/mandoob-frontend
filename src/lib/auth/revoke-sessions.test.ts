process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_to_min_length_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@/lib/errors';

describe('revokeAllSessions', () => {
  it('uses the service-role store for the selected user', async () => {
    const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const calls: string[] = [];
    const { revokeAllSessionsWith } = await import('./revoke-sessions');
    await revokeAllSessionsWith(
      {
        revoke: async (candidateUserId) => {
          calls.push(candidateUserId);
          return { data: 2, error: null };
        },
      },
      userId,
    );
    assert.deepEqual(calls, [userId]);
  });

  it('sanitizes service-role store failures', async () => {
    const { revokeAllSessionsWith } = await import('./revoke-sessions');
    await assert.rejects(
      () =>
        revokeAllSessionsWith(
          { revoke: async () => ({ data: null, error: new Error('raw database secret') }) },
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
      (error) =>
        error instanceof ApiError &&
        error.code === 'INTERNAL' &&
        !/raw|database|secret/iu.test(error.message),
    );
  });
});
