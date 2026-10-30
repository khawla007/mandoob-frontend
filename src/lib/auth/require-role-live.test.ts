import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionProfile } from './require-user';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

const actorId = '22222222-2222-4222-8222-222222222222';
const tenantId = '11111111-1111-4111-8111-111111111111';

function session(role: SessionProfile['role']): SessionProfile {
  return {
    id: actorId,
    email: 'actor@example.com',
    role,
    tenantId: 'stale-jwt-tenant',
    aal: 'aal1',
    mfaEnrolled: false,
  };
}

function guardDeps(current: SessionProfile, results: Array<{ data: unknown; error: unknown }>) {
  const calls: Array<
    | { kind: 'from'; table: string; select: string; filters: Record<string, unknown> }
    | { kind: 'rpc'; name: string; args: Record<string, unknown> }
  > = [];
  let index = 0;
  const supabase = {
    from(table: string) {
      let selected = '';
      const filters: Record<string, unknown> = {};
      const query = {
        select(columns: string) {
          selected = columns;
          return query;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        async maybeSingle() {
          calls.push({ kind: 'from', table, select: selected, filters: { ...filters } });
          return results[index++];
        },
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ kind: 'rpc', name, args });
      return results[index++];
    },
  };
  return {
    calls,
    deps: {
      requireSession: async () => current,
      supabase: supabase as never,
      deny: () => {
        throw new Error('DENIED');
      },
    },
  };
}

test('verified assigned PRO receives the authoritative company tenant from one final live query', async () => {
  const { resolveAuthoritativeRole } = await import('./require-role');
  const auth = guardDeps(session('pro'), [
    { data: { role: 'pro', status: 'active', tenant_id: null }, error: null },
    {
      data: tenantId,
      error: null,
    },
  ]);
  const result = await resolveAuthoritativeRole(['pro'], auth.deps);
  assert.equal(result.tenantId, tenantId);
  assert.deepEqual(auth.calls[1], {
    kind: 'rpc',
    name: 'read_authoritative_pro_tenant',
    args: { p_actor_id: actorId },
  });
});

test('unverified or released PRO and stale JWT roles fail closed', async () => {
  const { resolveAuthoritativeRole } = await import('./require-role');
  for (const denied of [
    guardDeps(session('pro'), [
      { data: { role: 'pro', status: 'active', tenant_id: null }, error: null },
      { data: null, error: null },
    ]),
    guardDeps(session('pro'), [
      { data: { role: 'customer', status: 'active', tenant_id: tenantId }, error: null },
    ]),
  ]) {
    await assert.rejects(() => resolveAuthoritativeRole(['pro'], denied.deps), /DENIED/);
  }
});

test('admin and super_admin are equivalent business-operator requests', async () => {
  const { resolveAuthoritativeRole } = await import('./require-role');
  for (const [authoritative, requested] of [
    ['admin', 'super_admin'],
    ['super_admin', 'admin'],
  ] as const) {
    const auth = guardDeps(session(requested), [
      { data: { role: authoritative, status: 'active', tenant_id: null }, error: null },
    ]);
    assert.equal((await resolveAuthoritativeRole([requested], auth.deps)).role, authoritative);
  }
});

test('customer and employee require active authoritative tenant state', async () => {
  const { resolveAuthoritativeRole } = await import('./require-role');
  for (const role of ['customer', 'employee'] as const) {
    const active = guardDeps(session(role), [
      { data: { role, status: 'active', tenant_id: tenantId }, error: null },
    ]);
    assert.equal((await resolveAuthoritativeRole([role], active.deps)).tenantId, tenantId);
    const inactive = guardDeps(session(role), [
      { data: { role, status: 'suspended', tenant_id: tenantId }, error: null },
    ]);
    await assert.rejects(() => resolveAuthoritativeRole([role], inactive.deps), /DENIED/);
  }
});

test('public session resolver returns the live active account role', async () => {
  const { getAuthoritativeSessionProfile } = await import('./require-role');
  const auth = guardDeps(session('admin'), [
    { data: { role: 'super_admin', status: 'active', tenant_id: null }, error: null },
  ]);

  const result = await getAuthoritativeSessionProfile({
    getSession: async () => session('admin'),
    supabase: auth.deps.supabase,
  });

  assert.equal(result?.role, 'super_admin');
  assert.equal(result?.tenantId, null);
});

test('public session resolver returns null for stale or invalid live accounts', async () => {
  const { getAuthoritativeSessionProfile } = await import('./require-role');
  for (const profile of [
    null,
    { role: 'admin', status: 'suspended', tenant_id: null },
    { role: 'admin', status: 'active', tenant_id: tenantId },
  ]) {
    const auth = guardDeps(session('admin'), [{ data: profile, error: null }]);
    assert.equal(
      await getAuthoritativeSessionProfile({
        getSession: async () => session('admin'),
        supabase: auth.deps.supabase,
      }),
      null,
    );
  }
});

test('privileged sessions require both enrolled MFA and AAL2 at direct boundaries', async () => {
  const { enforcePrivilegedSession } = await import('./require-role');
  for (const role of ['super_admin', 'admin', 'pro'] as const) {
    const redirects: string[] = [];
    await assert.rejects(
      () =>
        enforcePrivilegedSession(
          { ...session(role), mfaEnrolled: false, aal: 'aal1' },
          {
            redirect: (path) => {
              redirects.push(path);
              throw new Error('REDIRECT');
            },
          },
        ),
      /REDIRECT/u,
    );
    assert.deepEqual(redirects, ['/mfa/enroll']);
    redirects.length = 0;
    await assert.rejects(
      () =>
        enforcePrivilegedSession(
          { ...session(role), mfaEnrolled: true, aal: 'aal1' },
          {
            redirect: (path) => {
              redirects.push(path);
              throw new Error('REDIRECT');
            },
          },
        ),
      /REDIRECT/u,
    );
    assert.deepEqual(redirects, ['/mfa/challenge']);
  }
});

test('customer and employee sessions do not receive the privileged MFA gate', async () => {
  const { enforcePrivilegedSession } = await import('./require-role');
  for (const role of ['customer', 'employee'] as const) {
    const redirects: string[] = [];
    await enforcePrivilegedSession(
      { ...session(role), mfaEnrolled: false, aal: 'aal1' },
      {
        redirect: (path) => {
          redirects.push(path);
          throw new Error('REDIRECT');
        },
      },
    );
    assert.deepEqual(redirects, []);
  }
});
