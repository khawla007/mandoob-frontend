import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ApiError } from '@/lib/errors';
import { compensateInvitedUser } from './invited-user-compensation';

const userId = '11111111-1111-4111-8111-111111111111';

function fakeAdmin(result: unknown, throws = false) {
  let deletes = 0;
  return {
    get deletes() {
      return deletes;
    },
    client: {
      auth: {
        admin: {
          async deleteUser() {
            deletes += 1;
            if (throws) throw result;
            return result;
          },
        },
      },
    },
  };
}

test('a returned deleteUser error fails closed and logs only sanitized diagnostics', async () => {
  const admin = fakeAdmin({ error: { code: 'provider_denied', message: 'provider secret' } });
  const logs: unknown[][] = [];

  await assert.rejects(
    () =>
      compensateInvitedUser(
        admin.client as never,
        userId,
        'profile persistence failed',
        (...args) => logs.push(args),
      ),
    (error: unknown) => {
      assert.deepEqual(
        error instanceof Error
          ? {
              name: error.constructor.name,
              message: error.message,
              code: 'code' in error && error.code,
            }
          : error,
        {
          name: 'ApiError',
          message: 'Could not safely roll back user creation',
          code: 'USER_CLEANUP_FAILED',
        },
      );
      return true;
    },
  );
  assert.equal(admin.deletes, 1);
  assert.equal(JSON.stringify(logs).includes('provider secret'), false);
  assert.match(JSON.stringify(logs), /profile persistence failed/u);
  assert.match(JSON.stringify(logs), /provider_denied/u);
});

test('a thrown provider failure is sanitized and cleanup success preserves the caller path', async () => {
  const thrown = fakeAdmin(new Error('provider transport secret'), true);
  const logs: unknown[][] = [];
  await assert.rejects(
    () =>
      compensateInvitedUser(thrown.client as never, userId, 'role sub-row failed', (...args) =>
        logs.push(args),
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'Could not safely roll back user creation' &&
      'code' in error &&
      error.code === 'USER_CLEANUP_FAILED',
  );
  assert.equal(JSON.stringify(logs).includes('provider transport secret'), false);

  const clean = fakeAdmin({ data: {}, error: null });
  const original = new ApiError('VALIDATION_FAILED', 'Could not create role profile', 500);
  await assert.rejects(
    async () => {
      await compensateInvitedUser(clean.client as never, userId, 'role sub-row failed');
      throw original;
    },
    (error: unknown) => error === original,
  );
  assert.equal(clean.deletes, 1);
});

test('profile and role-sub-row failure paths invoke checked compensation', () => {
  const source = readFileSync('src/lib/data/admin-create-user.ts', 'utf8');

  assert.match(
    source,
    /profiles upsert failed[\s\S]*?await compensate\('profiles upsert failed'\)/u,
  );
  assert.match(source, /sub-row insert failed[\s\S]*?await compensate\('sub-row insert error'\)/u);
  assert.match(source, /return compensateInvitedUser\(admin, newUserId, reason\)/u);
});
