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
  const calls: Array<{ table: string; select: string; filters: Record<string, unknown> }> = [];
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
          calls.push({ table, select: selected, filters: { ...filters } });
          return results[index++];
        },
      };
      return query;
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
      data: { role: 'pro', status: 'active', active_assignments: [{ tenant_id: tenantId }] },
      error: null,
    },
  ]);
  const result = await resolveAuthoritativeRole(['pro'], auth.deps);
  assert.equal(result.tenantId, tenantId);
  assert.deepEqual(auth.calls[1], {
    table: 'profiles',
    select:
      'role, status, pro_profiles!pro_profiles_profile_id_fkey!inner(credentials_verified), active_assignments:pro_company_assignments!pro_company_assignments_pro_profile_id_fkey!inner(tenant_id)',
    filters: {
      id: actorId,
      role: 'pro',
      status: 'active',
      'pro_profiles.credentials_verified': true,
      'active_assignments.status': 'active',
    },
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
