import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';
const nativeRequire = createRequire(import.meta.url);

// Execute the real route/auth composition. Only SSR auth and database transports
// are substituted; no requireSession, requirePro, or profile resolver is injected.
function composition() {
  const state = {
    signedIn: true,
    aal: 'aal2',
    role: 'pro',
    status: 'active',
    tenant: TENANT as string | null,
    profileError: false,
    tenantRpcReads: 0,
    authoritativeTenant: null as string | null,
    mfaEnrolled: true,
    successiveProfileRoles: [] as string[],
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: state.signedIn
            ? {
                id: ACTOR,
                email: 'actor@example.test',
                app_metadata: { mandoob_role: 'pro', tenant_id: TENANT },
              }
            : null,
        },
      }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: state.aal } }) },
    },
    from: () => {
      let selected = '';
      const query = {
        select: (columns: string) => {
          selected = columns;
          return query;
        },
        eq: (_column: string, id: string) => {
          assert.equal(id, ACTOR);
          return query;
        },
        maybeSingle: async () => ({
          data: {
            role: selected.startsWith('role, status')
              ? (state.successiveProfileRoles.shift() ?? state.role)
              : state.role,
            status: state.status,
            tenant_id: state.tenant,
            mfa_enrolled_at: state.mfaEnrolled ? '2026-01-01' : null,
          },
          error: state.profileError ? { message: 'private failure' } : null,
        }),
      };
      return query;
    },
    rpc: async () => {
      state.tenantRpcReads += 1;
      return { data: state.authoritativeTenant, error: null };
    },
  };
  const cache = new Map<string, Record<string, unknown>>();
  // Transpiled module exports are dynamically typed at this test-only boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function load(name: string, parent = join(process.cwd(), 'src/index.ts')): Record<string, any> {
    if (name === 'server-only') return {};
    if (name === '@/lib/supabase/server') return { createSupabaseServerClient: async () => client };
    if (name === '@/lib/supabase/service-role')
      return { createSupabaseServiceRoleClient: () => client };
    if (!name.startsWith('@/') && !name.startsWith('.')) return nativeRequire(name);
    const path = name.startsWith('@/')
      ? join(process.cwd(), 'src', name.slice(2))
      : join(dirname(parent), name);
    const file = path.endsWith('.ts') ? path : `${path}.ts`;
    if (cache.has(file)) return cache.get(file)!;
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', code)(
      (dependency: string) => load(dependency, file),
      exports,
    );
    return exports;
  }
  return { state, load };
}

test('default credential composition admits released/ineligible PRO without company authority', async () => {
  const { state, load } = composition();
  const { requireLiveProAccount } = load('@/app/api/v1/_shared/pro-lifecycle-routes');
  for (const tenant of [null, TENANT]) {
    state.tenant = tenant;
    const session = await requireLiveProAccount();
    assert.equal(session.id, ACTOR);
    assert.equal(session.tenantId, null);
  }
  assert.equal(state.tenantRpcReads, 0);
  const { createCredentialPostHandler } = load(
    '@/app/api/v1/account/pro/credentials/route-handler',
  );
  const handler = createCredentialPostHandler({
    guardCsrf: async () => null,
    resolveTarget: async (id: string) => {
      assert.equal(id, ACTOR);
      return { proProfileId: id, credentialIds: [] };
    },
    limit: async () => 'allowed',
    mutate: async () => {
      throw new Error('invalid input must not mutate');
    },
  });
  assert.equal(
    (await handler(new Request('http://localhost', { method: 'POST', body: '{}' }))).status,
    400,
  );
  state.aal = 'aal1';
  assert.equal(
    (await handler(new Request('http://localhost', { method: 'POST', body: '{}' }))).status,
    403,
  );
  state.aal = 'aal2';
  assert.equal(
    (
      await handler(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ credentialId: TENANT }),
        }),
      )
    ).status,
    404,
  );
  const csrfDenied = createCredentialPostHandler({
    guardCsrf: async () => new Response(null, { status: 403 }),
  });
  state.signedIn = false;
  assert.equal((await csrfDenied(new Request('http://localhost'))).status, 403);
});

test('account identity preserves authoritative non-PRO scope and fresh MFA state', async () => {
  const { state, load } = composition();
  const { requireAccountUser } = load('@/lib/auth/require-account-user');
  state.mfaEnrolled = false;
  assert.equal((await requireAccountUser()).mfaEnrolled, false);
  state.role = 'customer';
  assert.equal((await requireAccountUser()).tenantId, TENANT);
  state.tenant = null;
  await assert.rejects(requireAccountUser);
  state.role = 'admin';
  assert.equal((await requireAccountUser()).tenantId, null);
  state.tenant = TENANT;
  await assert.rejects(requireAccountUser);
  assert.equal(state.tenantRpcReads, 0);
});

test('account identity cannot gain company scope during a non-PRO to PRO role change', async () => {
  const { state, load } = composition();
  const { requireAccountUser } = load('@/lib/auth/require-account-user');
  state.successiveProfileRoles = ['customer', 'pro'];
  state.authoritativeTenant = TENANT;
  const session = await requireAccountUser();
  assert.equal(session.role, 'pro');
  assert.equal(session.tenantId, null);
  assert.equal(state.tenantRpcReads, 1);
  assert.deepEqual(state.successiveProfileRoles, []);
});

test('default lifecycle composition fails closed on null auth, status, role and operator scope changes', async () => {
  const { state, load } = composition();
  const { requireLiveProAccount, requireLiveLifecycleViewer } = load(
    '@/app/api/v1/_shared/pro-lifecycle-routes',
  );
  state.signedIn = false;
  await assert.rejects(requireLiveProAccount);
  state.signedIn = true;
  for (const status of ['invited', 'inactive', 'suspended']) {
    state.status = status;
    await assert.rejects(requireLiveProAccount);
  }
  state.status = 'active';
  state.profileError = true;
  await assert.rejects(requireLiveProAccount);
  state.profileError = false;
  for (const role of ['customer', 'employee', 'admin', 'super_admin', 'unknown']) {
    state.role = role;
    await assert.rejects(requireLiveProAccount);
  }
  state.role = 'admin';
  await assert.rejects(requireLiveLifecycleViewer);
  state.tenant = null;
  assert.equal((await requireLiveLifecycleViewer()).role, 'admin');
});

test('account entrypoints use the scoped guard and sensitive leaf pages authorize directly', () => {
  for (const file of [
    'src/app/account/layout.tsx',
    'src/app/account/role/page.tsx',
    'src/app/account/actions.ts',
    'src/app/account/sessions/page.tsx',
    'src/components/account/MfaTab.tsx',
    'src/components/account/SessionsTab.tsx',
    'src/app/account/page.tsx',
    'src/app/account/security/page.tsx',
  ]) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    assert.match(source, /await requireAccountUser\(\)/u, file);
    assert.doesNotMatch(source, /await requireUser\(\)/u, file);
  }
});
