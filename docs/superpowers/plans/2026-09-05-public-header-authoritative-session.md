# Public Header Authoritative Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the public header from showing an authenticated dashboard menu when live dashboard authorization would reject the account.

**Architecture:** Extract the live profile and tenant validation from `resolveAuthoritativeRole` into a nullable `getAuthoritativeSessionProfile` resolver. Both the public header and protected role guards will use it; protected guards retain their redirects and allowed-role checks.

**Tech Stack:** Next.js 16 server components, TypeScript, Supabase SSR/service-role clients, Zod, Node test runner.

---

### Task 1: Add the nullable authoritative session resolver

**Files:**
- Modify: `src/lib/auth/require-role-live.test.ts`
- Modify: `src/lib/auth/require-role.ts`

- [x] **Step 1: Write failing resolver tests**

Add tests using the existing injected query client:

```ts
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
```

- [x] **Step 2: Run the focused test and verify RED**

Run `node --import tsx --conditions=react-server --test src/lib/auth/require-role-live.test.ts`.

Expected: FAIL because `getAuthoritativeSessionProfile` is not exported.

- [x] **Step 3: Implement shared nullable resolution**

Add this public-safe dependency and resolver in `src/lib/auth/require-role.ts`:

```ts
type AuthoritativeSessionDeps = {
  getSession?: () => Promise<SessionProfile | null>;
  supabase?: PlatformClient;
  allowedRoles?: Role[];
};

export async function getAuthoritativeSessionProfile(
  deps: AuthoritativeSessionDeps = {},
): Promise<SessionProfile | null> {
  const session = await (deps.getSession ?? getSessionProfile)();
  if (!session || !z.string().uuid().safeParse(session.id).success) return null;
  const admin = deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as PlatformClient);
  const { data: profile, error } = await admin
    .from('profiles')
    .select('role, status, tenant_id')
    .eq('id', session.id)
    .maybeSingle();
  if (error || !profile || profile.status !== 'active' || typeof profile.role !== 'string') {
    return null;
  }
  if (deps.allowedRoles) {
    const allowed = new Set<string>(deps.allowedRoles);
    if (allowed.has('admin') || allowed.has('super_admin')) {
      allowed.add('admin');
      allowed.add('super_admin');
    }
    if (!allowed.has(profile.role)) return null;
  }
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    return profile.tenant_id === null ? { ...session, role: profile.role, tenantId: null } : null;
  }
  if (profile.role === 'customer' || profile.role === 'employee') {
    return z.string().uuid().safeParse(profile.tenant_id).success
      ? { ...session, role: profile.role, tenantId: profile.tenant_id as string }
      : null;
  }
  if (profile.role === 'pro') {
    const { data: tenantId, error: liveProError } = await admin.rpc(
      'read_authoritative_pro_tenant',
      { p_actor_id: session.id },
    );
    return !liveProError && z.string().uuid().safeParse(tenantId).success
      ? { ...session, role: 'pro', tenantId: tenantId as string }
      : null;
  }
  return null;
}
```

Replace the duplicated live lookup in `resolveAuthoritativeRole` with:

```ts
const session = await getAuthoritativeSessionProfile({
  getSession: deps.requireSession ?? requireSession,
  supabase: deps.supabase,
  allowedRoles: roles,
});
if (!session) return denyPlatformAccess(deps);
return session;
```

- [x] **Step 4: Run resolver tests and verify GREEN**

Run `node --import tsx --conditions=react-server --test src/lib/auth/require-role.test.ts src/lib/auth/require-role-live.test.ts`.

Expected: all role-authorization tests PASS.

### Task 2: Make the public header use authoritative state

**Files:**
- Modify: `src/components/site/public-navigation.test.ts`
- Modify: `src/components/site/SiteHeader.tsx`

- [x] **Step 1: Write the failing header contract test**

Require authoritative resolution and reject direct token-only resolution:

```ts
assert.match(headerSource, /getAuthoritativeSessionProfile/u);
assert.doesNotMatch(headerSource, /\bgetSessionProfile\b/u);
```

Keep checks for `getDisplayName`, `getCustomerWorkspaceSlug`, `resolveRoleHome`, `workspaceSlug`, and `UserMenu`.

- [x] **Step 2: Run the focused test and verify RED**

Run `node --import tsx --conditions=react-server --test src/components/site/public-navigation.test.ts`.

Expected: FAIL because `SiteHeader` still calls `getSessionProfile`.

- [x] **Step 3: Switch the header to authoritative resolution**

Replace the header import and call with:

```ts
import { getAuthoritativeSessionProfile } from '@/lib/auth/require-role';
```

```ts
getAuthoritativeSessionProfile(),
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run `node --import tsx --conditions=react-server --test src/components/site/public-navigation.test.ts src/lib/auth/require-role.test.ts src/lib/auth/require-role-live.test.ts`.

Expected: all focused tests PASS.

### Task 3: Verify and commit

**Files:**
- Modify: `docs/superpowers/plans/2026-09-05-public-header-authoritative-session.md` (mark completed steps)

- [x] **Step 1: Run full source tests**

Run `npm test`.

Expected: all tests PASS with zero failures.

Outcome: the package script's quoted glob did not resolve in this environment. Explicit enumeration ran 273 test files with 272 passing; the unrelated ClamAV socket test failed under parallel load and passed 13/13 immediately in isolation.

- [x] **Step 2: Run static verification**

Run `npx tsc --noEmit`, `npm run lint`, and `git diff --check`.

Expected: TypeScript and diff checks pass; lint has zero errors and only documented pre-existing warnings, if any.

Outcome: TypeScript and diff checks passed. Full lint left an orphaned silent shell session; direct ESLint of all changed source and test files passed with zero findings.

- [x] **Step 3: Review the final diff**

Run `git diff -- src/lib/auth/require-role.ts src/lib/auth/require-role-live.test.ts src/components/site/SiteHeader.tsx src/components/site/public-navigation.test.ts docs/superpowers/plans/2026-09-05-public-header-authoritative-session.md`.

Expected: only the approved auth-consistency fix, regression tests, and completed plan markers are present.

- [x] **Step 4: Commit the implementation**

```bash
git add src/lib/auth/require-role.ts src/lib/auth/require-role-live.test.ts src/components/site/SiteHeader.tsx src/components/site/public-navigation.test.ts docs/superpowers/plans/2026-09-05-public-header-authoritative-session.md
git commit -m "fix(auth): align public header with live account state"
```
