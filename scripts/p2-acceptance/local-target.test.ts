import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertLocalAcceptanceTarget, parseSupabaseStatus } from './local-target';

const localEnv = {
  P2_ACCEPTANCE_LOCAL_ONLY: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56021',
  SUPABASE_DB_URL: 'postgresql://postgres:secret@127.0.0.1:56022/postgres',
  SUPABASE_STORAGE_URL: 'http://localhost:56021/storage/v1',
  SUPABASE_SERVICE_ROLE_KEY: 'process-only-secret',
};

const localStatus = JSON.stringify({
  API_URL: 'http://127.0.0.1:56021',
  DB_URL: 'postgresql://postgres:secret@127.0.0.1:56022/postgres',
  STORAGE_S3_URL: 'http://127.0.0.1:56021/storage/v1/s3',
});

const loopbackResolver = async () => ['127.0.0.1'];

describe('P2.12 local acceptance target guard', () => {
  it('accepts the exact running loopback project with an empty or fixture-only identity set', async () => {
    const result = await assertLocalAcceptanceTarget({
      env: localEnv,
      expectedProjectId: 'mandoob-p2-12-acceptance',
      actualProjectId: 'mandoob-p2-12-acceptance',
      status: parseSupabaseStatus(localStatus),
      resolveHost: loopbackResolver,
      unexpectedIdentityCount: 0,
    });

    assert.deepEqual(result, {
      apiOrigin: 'http://127.0.0.1:56021',
      databaseHost: '127.0.0.1',
      storageOrigin: 'http://localhost:56021',
      projectId: 'mandoob-p2-12-acceptance',
    });
  });

  for (const [name, override] of [
    ['missing opt-in', { P2_ACCEPTANCE_LOCAL_ONLY: undefined }],
    ['remote API', { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }],
    ['remote database', { SUPABASE_DB_URL: 'postgresql://postgres:x@db.example.com/postgres' }],
    ['remote storage', { SUPABASE_STORAGE_URL: 'https://storage.example.com/storage/v1' }],
    ['missing service role', { SUPABASE_SERVICE_ROLE_KEY: undefined }],
  ] as const) {
    it(`rejects ${name}`, async () => {
      await assert.rejects(
        () =>
          assertLocalAcceptanceTarget({
            env: { ...localEnv, ...override },
            expectedProjectId: 'mandoob-p2-12-acceptance',
            actualProjectId: 'mandoob-p2-12-acceptance',
            status: parseSupabaseStatus(localStatus),
            resolveHost: loopbackResolver,
            unexpectedIdentityCount: 0,
          }),
        /P2_LOCAL_GUARD/u,
      );
    });
  }

  it('rejects a hostname that resolves to any non-loopback address', async () => {
    const hostnameStatus = JSON.stringify({
      API_URL: 'http://local.test:56021',
      DB_URL: 'postgresql://postgres:secret@local.test:56022/postgres',
      STORAGE_S3_URL: 'http://local.test:56021/storage/v1/s3',
    });
    await assert.rejects(
      () =>
        assertLocalAcceptanceTarget({
          env: {
            ...localEnv,
            NEXT_PUBLIC_SUPABASE_URL: 'http://local.test:56021',
            SUPABASE_DB_URL: 'postgresql://postgres:secret@local.test:56022/postgres',
            SUPABASE_STORAGE_URL: 'http://local.test:56021/storage/v1',
          },
          expectedProjectId: 'mandoob-p2-12-acceptance',
          actualProjectId: 'mandoob-p2-12-acceptance',
          status: parseSupabaseStatus(hostnameStatus),
          resolveHost: async () => ['127.0.0.1', '203.0.113.10'],
          unexpectedIdentityCount: 0,
        }),
      /P2_LOCAL_GUARD/u,
    );
  });

  it('rejects the wrong or ambiguous local project', async () => {
    await assert.rejects(
      () =>
        assertLocalAcceptanceTarget({
          env: localEnv,
          expectedProjectId: 'mandoob-p2-12-acceptance',
          actualProjectId: 'another-project',
          status: parseSupabaseStatus(localStatus),
          resolveHost: loopbackResolver,
          unexpectedIdentityCount: 0,
        }),
      /P2_LOCAL_GUARD/u,
    );
  });

  it('rejects status endpoints that do not match the supplied target', async () => {
    await assert.rejects(
      () =>
        assertLocalAcceptanceTarget({
          env: localEnv,
          expectedProjectId: 'mandoob-p2-12-acceptance',
          actualProjectId: 'mandoob-p2-12-acceptance',
          status: parseSupabaseStatus(
            JSON.stringify({ ...JSON.parse(localStatus), API_URL: 'http://127.0.0.1:59999' }),
          ),
          resolveHost: loopbackResolver,
          unexpectedIdentityCount: 0,
        }),
      /P2_LOCAL_GUARD/u,
    );
  });

  it('rejects a disposable database containing a non-fixture identity', async () => {
    await assert.rejects(
      () =>
        assertLocalAcceptanceTarget({
          env: localEnv,
          expectedProjectId: 'mandoob-p2-12-acceptance',
          actualProjectId: 'mandoob-p2-12-acceptance',
          status: parseSupabaseStatus(localStatus),
          resolveHost: loopbackResolver,
          unexpectedIdentityCount: 1,
        }),
      /P2_LOCAL_GUARD/u,
    );
  });

  it('never includes credential values in a rejection', async () => {
    await assert.rejects(
      () =>
        assertLocalAcceptanceTarget({
          env: { ...localEnv, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' },
          expectedProjectId: 'mandoob-p2-12-acceptance',
          actualProjectId: 'mandoob-p2-12-acceptance',
          status: parseSupabaseStatus(localStatus),
          resolveHost: loopbackResolver,
          unexpectedIdentityCount: 0,
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message.includes('process-only-secret'), false);
        assert.equal((error as Error).message.includes('postgres:secret'), false);
        return true;
      },
    );
  });
});
