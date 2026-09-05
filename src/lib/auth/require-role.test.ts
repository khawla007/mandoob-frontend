import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionProfile } from './require-user';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const profileId = '11111111-1111-4111-8111-111111111111';

function platformDeps(
  jwtRole: SessionProfile['role'],
  result: { data: Record<string, unknown> | null; error: { message: string } | null },
) {
  const calls: Array<{ table: string; select: string; id: unknown }> = [];
  const session: SessionProfile = {
    id: profileId,
    email: 'operator@example.com',
    role: jwtRole,
    tenantId: null,
    aal: 'aal2',
    mfaEnrolled: true,
  };
  return {
    calls,
    deps: {
      requireSession: async () => session,
      supabase: {
        from(table: string) {
          let selected = '';
          let id: unknown;
          const chain = {
            select(columns: string) {
              selected = columns;
              return chain;
            },
            eq(name: string, value: unknown) {
              assert.equal(name, 'id');
              id = value;
              return chain;
            },
            async maybeSingle() {
              calls.push({ table, select: selected, id });
              return result;
            },
          };
          return chain;
        },
      } as never,
      deny: () => {
        throw new Error('DENIED');
      },
    },
  };
}

test('platform operator reloads active admin and super_admin authority', async () => {
  const { requirePlatformOperator } = await import('./require-role');
  for (const role of ['admin', 'super_admin'] as const) {
    const auth = platformDeps(role, {
      data: { role, status: 'active', tenant_id: null },
      error: null,
    });
    assert.equal((await requirePlatformOperator(auth.deps)).role, role);
    assert.deepEqual(auth.calls, [
      { table: 'profiles', select: 'role, status, tenant_id', id: profileId },
    ]);
  }
});

test('platform operator denies stale privileged JWT, inactive state and tenant scope', async () => {
  const { requirePlatformOperator } = await import('./require-role');
  for (const data of [
    { role: 'pro', status: 'active', tenant_id: null },
    { role: 'admin', status: 'suspended', tenant_id: null },
    { role: 'super_admin', status: 'active', tenant_id: 'tenant-1' },
  ]) {
    const auth = platformDeps('admin', { data, error: null });
    await assert.rejects(() => requirePlatformOperator(auth.deps), /DENIED/);
  }
});

test('platform operator fails closed on query errors and malformed session IDs', async () => {
  const { requirePlatformOperator } = await import('./require-role');
  const queryError = platformDeps('admin', {
    data: null,
    error: { message: 'database unavailable' },
  });
  await assert.rejects(() => requirePlatformOperator(queryError.deps), /DENIED/);

  const malformed = platformDeps('admin', {
    data: { role: 'admin', status: 'active', tenant_id: null },
    error: null,
  });
  malformed.deps.requireSession = async () => ({
    ...(await platformDeps('admin', { data: null, error: null }).deps.requireSession()),
    id: 'bad-id',
  });
  await assert.rejects(() => requirePlatformOperator(malformed.deps), /DENIED/);
  assert.equal(malformed.calls.length, 0);
});

test('dashboard MFA guards preserve challenge and enrollment destinations', async () => {
  const { requireAal2, requireMfaEnrolled } = await import('./require-role');
  const base: SessionProfile = {
    id: profileId,
    email: 'operator@example.com',
    role: 'super_admin',
    tenantId: null,
    aal: 'aal1',
    mfaEnrolled: false,
  };
  const redirects: string[] = [];
  const redirect = async (path: string): Promise<never> => {
    redirects.push(path);
    throw new Error('REDIRECTED');
  };

  await assert.rejects(() => requireAal2(base, { redirect }), /REDIRECTED/u);
  await assert.rejects(() => requireMfaEnrolled(base, { redirect }), /REDIRECTED/u);
  assert.deepEqual(redirects, ['/mfa/challenge', '/mfa/enroll']);
});

test('dashboard MFA guards accept AAL2 and enrolled sessions without redirecting', async () => {
  const { requireAal2, requireMfaEnrolled } = await import('./require-role');
  const redirects: string[] = [];
  const session: SessionProfile = {
    id: profileId,
    email: 'operator@example.com',
    role: 'pro',
    tenantId: '22222222-2222-4222-8222-222222222222',
    aal: 'aal2',
    mfaEnrolled: true,
  };

  await requireAal2(session, {
    redirect: async (path: string): Promise<never> => {
      redirects.push(path);
      throw new Error('UNEXPECTED_REDIRECT');
    },
  });
  await requireMfaEnrolled(session, {
    redirect: async (path: string): Promise<never> => {
      redirects.push(path);
      throw new Error('UNEXPECTED_REDIRECT');
    },
  });
  assert.deepEqual(redirects, []);
});
