import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionProfile } from './require-user';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const tenantId = '11111111-1111-4111-8111-111111111111';
const companyId = '33333333-3333-4333-8333-333333333333';

function session(
  role: SessionProfile['role'],
  overrides: Partial<SessionProfile> = {},
): SessionProfile {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'person@example.com',
    role,
    tenantId,
    aal: 'aal1',
    mfaEnrolled: false,
    ...overrides,
  };
}

type DbResult = { data: unknown; error: { message: string } | null };

function authDeps(current: SessionProfile, results: DbResult[]) {
  const calls: Array<
    | { kind: 'from'; table: string; select: string; filters: Record<string, unknown> }
    | { kind: 'rpc'; name: string; args: Record<string, unknown> }
  > = [];
  let resultIndex = 0;
  const supabase = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let selected = '';
      const chain = {
        select(columns: string) {
          selected = columns;
          return chain;
        },
        eq(name: string, value: unknown) {
          filters[name] = value;
          return chain;
        },
        async maybeSingle() {
          calls.push({ kind: 'from', table, select: selected, filters: { ...filters } });
          return results[resultIndex++];
        },
      };
      return chain;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ kind: 'rpc', name, args });
      return results[resultIndex++];
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

test('current active PRO assignment grants company access', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  const auth = authDeps(session('pro'), [
    { data: { role: 'pro', status: 'active', tenant_id: tenantId }, error: null },
    { data: true, error: null },
  ]);

  const result = await requireCompanyAccess(tenantId, auth.deps);

  assert.equal(result.role, 'pro');
  assert.deepEqual(auth.calls[0], {
    kind: 'from',
    table: 'profiles',
    select: 'role, status, tenant_id',
    filters: { id: result.id },
  });
  assert.deepEqual(auth.calls[1], {
    kind: 'rpc',
    name: 'authorize_pro_company_access',
    args: {
      p_actor_id: result.id,
      p_tenant_id: tenantId,
      p_company_id: null,
    },
  });
});

test('PostgreSQL UUID identifiers are accepted even with non-RFC variant bits', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  const postgresTenantId = '00000000-0000-0000-0000-000000000001';
  const auth = authDeps(session('pro', { tenantId: postgresTenantId }), [
    { data: { role: 'pro', status: 'active', tenant_id: postgresTenantId }, error: null },
    { data: true, error: null },
  ]);
  assert.equal(
    (await requireCompanyAccess(postgresTenantId, auth.deps)).tenantId,
    postgresTenantId,
  );
  assert.deepEqual(auth.calls[1], {
    kind: 'rpc',
    name: 'authorize_pro_company_access',
    args: { p_actor_id: session('pro').id, p_tenant_id: postgresTenantId, p_company_id: null },
  });
});

test('credential invalidation immediately denies an actively assigned PRO', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  const auth = authDeps(session('pro'), [
    { data: { role: 'pro', status: 'active', tenant_id: null }, error: null },
    { data: null, error: null },
  ]);

  await assert.rejects(() => requireCompanyAccess(tenantId, auth.deps), /DENIED/);
  assert.equal(auth.calls.length, 2);
});

test('released assignment denies a PRO even when JWT tenant metadata is stale', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  const auth = authDeps(session('pro'), [
    { data: { role: 'pro', status: 'active', tenant_id: null }, error: null },
    { data: null, error: null },
  ]);

  await assert.rejects(() => requireCompanyAccess(tenantId, auth.deps), /DENIED/);
});

test('wrong company and inactive PRO are denied', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  const wrongCompany = authDeps(session('pro'), [
    { data: { role: 'pro', status: 'active', tenant_id: tenantId }, error: null },
    { data: null, error: null },
  ]);
  await assert.rejects(() => requireCompanyAccess(tenantId, wrongCompany.deps), /DENIED/);

  const inactive = authDeps(session('pro'), [
    { data: { role: 'pro', status: 'suspended', tenant_id: tenantId }, error: null },
  ]);
  await assert.rejects(() => requireCompanyAccess(tenantId, inactive.deps), /DENIED/);
  assert.equal(inactive.calls.length, 1);
});

test('active customer and employee require an authoritative tenant match', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  for (const role of ['customer', 'employee'] as const) {
    const matching = authDeps(session(role), [
      { data: { role, status: 'active', tenant_id: tenantId }, error: null },
    ]);
    assert.equal((await requireCompanyAccess(tenantId, matching.deps)).role, role);

    const mismatching = authDeps(session(role), [
      { data: { role, status: 'active', tenant_id: 'other-tenant' }, error: null },
    ]);
    await assert.rejects(() => requireCompanyAccess(tenantId, mismatching.deps), /DENIED/);
  }
});

test('active admin and super_admin have equal platform access from authoritative state', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  for (const role of ['admin', 'super_admin'] as const) {
    const auth = authDeps(session(role), [
      { data: { role, status: 'active', tenant_id: null }, error: null },
    ]);
    assert.equal((await requireCompanyAccess(tenantId, auth.deps)).role, role);
  }
});

test('profile and assignment database errors fail closed', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  const profileError = authDeps(session('admin'), [
    { data: null, error: { message: 'database unavailable' } },
  ]);
  await assert.rejects(() => requireCompanyAccess(tenantId, profileError.deps), /DENIED/);

  const assignmentError = authDeps(session('pro'), [
    { data: { role: 'pro', status: 'active', tenant_id: tenantId }, error: null },
    { data: null, error: { message: 'database unavailable' } },
  ]);
  await assert.rejects(() => requireCompanyAccess(tenantId, assignmentError.deps), /DENIED/);
});

test('JWT role changes are denied rather than trusted', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  const auth = authDeps(session('admin'), [
    { data: { role: 'customer', status: 'active', tenant_id: tenantId }, error: null },
  ]);
  await assert.rejects(() => requireCompanyAccess(tenantId, auth.deps), /DENIED/);
});

test('malformed tenant and session IDs deny before service-role queries', async () => {
  const { requireCompanyAccess } = await import('./require-company-access');
  const malformedTenant = authDeps(session('pro'), []);
  await assert.rejects(() => requireCompanyAccess('not-a-tenant', malformedTenant.deps), /DENIED/);
  assert.equal(malformedTenant.calls.length, 0);

  const malformedSession = authDeps(session('pro', { id: 'not-a-profile' }), []);
  await assert.rejects(() => requireCompanyAccess(tenantId, malformedSession.deps), /DENIED/);
  assert.equal(malformedSession.calls.length, 0);
});

test('exact-company access binds a PRO assignment to both tenant and company', async () => {
  const { requireExactCompanyAccess } = await import('./require-company-access');
  const auth = authDeps(session('pro'), [
    { data: { role: 'pro', status: 'active', tenant_id: null }, error: null },
    { data: true, error: null },
  ]);

  const result = await requireExactCompanyAccess(tenantId, companyId, auth.deps);
  assert.equal(result.role, 'pro');
  assert.deepEqual(auth.calls[1], {
    kind: 'rpc',
    name: 'authorize_pro_company_access',
    args: {
      p_actor_id: result.id,
      p_tenant_id: tenantId,
      p_company_id: companyId,
    },
  });
});

test('exact-company access grants authoritative tenantless operators and denies workspace roles', async () => {
  const { requireExactCompanyAccess } = await import('./require-company-access');
  for (const role of ['admin', 'super_admin'] as const) {
    const operator = authDeps(session(role), [
      { data: { role, status: 'active', tenant_id: null }, error: null },
    ]);
    assert.equal((await requireExactCompanyAccess(tenantId, companyId, operator.deps)).role, role);
  }

  for (const role of ['customer', 'employee'] as const) {
    const workspace = authDeps(session(role), [
      { data: { role, status: 'active', tenant_id: tenantId }, error: null },
    ]);
    await assert.rejects(
      () => requireExactCompanyAccess(tenantId, companyId, workspace.deps),
      /DENIED/u,
    );
  }
});

test('exact-company access rejects malformed company IDs before service-role queries', async () => {
  const { requireExactCompanyAccess } = await import('./require-company-access');
  const auth = authDeps(session('pro'), []);
  await assert.rejects(
    () => requireExactCompanyAccess(tenantId, 'not-a-company', auth.deps),
    /DENIED/u,
  );
  assert.equal(auth.calls.length, 0);
});
