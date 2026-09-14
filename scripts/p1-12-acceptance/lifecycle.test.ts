import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { P112_BASELINE, P112_FIXTURE, P112_TARGET } from './contract';

type MutableState = {
  [key: string]: unknown;
  authUsers: number;
  profiles: number;
  mfaFactors: number;
  recoveryCodes: number;
  blogPosts: number;
  rateLimits: number;
  authEvents: number;
  authFailedAttempts: number;
  factorStatus?: 'unverified' | 'verified';
  mfaEnrolledAt?: string | null;
  failedKeys?: string[];
  tamper?: string;
};

type Manifest = {
  phase: 'planned' | 'auth-created' | 'profile-created' | 'content-created' | 'cleanup';
  email: string;
  password: string;
  userId?: string;
};

function makeFixture() {
  const state: MutableState = {
    ...P112_BASELINE,
    cmsPageSlugs: [...P112_BASELINE.cmsPageSlugs],
  };
  const operations: string[] = [];
  let manifest: Manifest | null = null;
  let failure: { operation: string; timing: 'before' | 'after' } | null = null;
  function mutate(operation: string, effect: () => void) {
    operations.push(operation);
    if (failure?.operation === operation && failure.timing === 'before') {
      throw new Error(`injected ${operation}`);
    }
    effect();
    if (failure?.operation === operation && failure.timing === 'after') {
      throw new Error(`injected ${operation}`);
    }
  }
  const store = {
    async readBaseline() {
      operations.push('store:read-baseline');
      return { ...state, cmsPageSlugs: [...(state.cmsPageSlugs as string[])] };
    },
    async deleteFixtureContent(ids: readonly string[]) {
      assert.deepEqual(ids, [P112_FIXTURE.publishedPostId, P112_FIXTURE.unpublishedPostId]);
      mutate('store:delete-content', () => {
        state.blogPosts = 0;
      });
    },
    async deleteFixtureUserRows(userId: string) {
      assert.match(userId, /^11200000-0000-4000-8000-/u);
      mutate('store:delete-user-rows', () => {
        state.profiles = 0;
        state.recoveryCodes = 0;
        state.rateLimits = 0;
        state.authEvents = 0;
        state.authFailedAttempts = 0;
      });
    },
    async findFixtureUserIdByEmail(email: string) {
      operations.push('store:find-user-by-email');
      return state.authUsers === 1 && manifest?.email === email
        ? '11200000-0000-4000-8000-000000000099'
        : null;
    },
    async readFixtureState(userId: string, email: string) {
      operations.push('store:read-fixture');
      return {
        profile:
          state.profiles === 1
            ? {
                id: userId,
                role: state.tamper === 'profile' ? 'employee' : 'super_admin',
                status: 'active',
                fullName: 'P1.12 synthetic acceptance user',
                mfaEnrolledAt:
                  state.tamper === 'marker' ? 'not-a-timestamp' : (state.mfaEnrolledAt ?? null),
              }
            : null,
        posts:
          state.blogPosts === 2
            ? [
                {
                  id: P112_FIXTURE.publishedPostId,
                  slug: P112_FIXTURE.publishedPostSlug,
                  status: 'published',
                  noindex: true,
                  title: 'P1.12 public acceptance fixture',
                  contentHtml:
                    state.tamper === 'post'
                      ? '<p>tampered</p>'
                      : '<p>This synthetic local post verifies the published Blog detail presentation.</p>',
                },
                {
                  id: P112_FIXTURE.unpublishedPostId,
                  slug: P112_FIXTURE.unpublishedPostSlug,
                  status: 'draft',
                  noindex: true,
                  title: 'P1.12 unpublished acceptance fixture',
                  contentHtml: '<p>This draft must remain unavailable to public readers.</p>',
                },
              ]
            : [],
        blogMedia: state.tamper === 'child' ? 1 : 0,
        blogTerms: 0,
        blogPostTerms: 0,
        blogPostGalleryItems: 0,
        blogPostRevisions: 0,
        recoveryCodes: state.recoveryCodes,
        rateLimitKeys:
          state.rateLimits === 0 ? [] : [`mfa-enroll:11200000-0000-4000-8000-000000000099`],
        authEventsTotal: state.authEvents,
        unownedAuthEvents: state.tamper === 'event' ? 1 : 0,
        authFailedAttemptsTotal: state.authFailedAttempts,
        authFailedAttemptKeys:
          state.tamper === 'net'
            ? ['net:203.0.113.0/24']
            : state.authFailedAttempts === 0
              ? []
              : (state.failedKeys ?? []),
        requestedEmail: email,
      };
    },
    async insertFixtureContent(rows: readonly { id: string; slug: string; status: string }[]) {
      assert.deepEqual(
        rows.map(({ id, slug, status }) => ({ id, slug, status })),
        [
          {
            id: P112_FIXTURE.publishedPostId,
            slug: P112_FIXTURE.publishedPostSlug,
            status: 'published',
          },
          {
            id: P112_FIXTURE.unpublishedPostId,
            slug: P112_FIXTURE.unpublishedPostSlug,
            status: 'draft',
          },
        ],
      );
      mutate('store:insert-content', () => {
        state.blogPosts = 2;
      });
    },
    async insertProfile(input: { id: string; role: string; status: string }) {
      assert.deepEqual(input, {
        id: '11200000-0000-4000-8000-000000000099',
        role: 'super_admin',
        status: 'active',
      });
      mutate('store:insert-profile', () => {
        state.profiles = 1;
      });
    },
  };
  const auth = {
    async createUser(input: { email: string; password: string; appMetadata: unknown }) {
      assert.deepEqual(input.appMetadata, {
        mandoob_role: 'super_admin',
        mandoob_status: 'active',
      });
      mutate('auth:create-user', () => {
        state.authUsers = 1;
      });
      return '11200000-0000-4000-8000-000000000099';
    },
    async deleteUser(userId: string) {
      assert.equal(userId, '11200000-0000-4000-8000-000000000099');
      mutate('auth:delete-user', () => {
        state.authUsers = 0;
        state.mfaFactors = 0;
      });
    },
    async readUser(userId: string) {
      operations.push('auth:read-user');
      if (state.authUsers !== 1) return null;
      return {
        id: userId,
        email:
          state.tamper === 'email'
            ? 'someone-else@example.invalid'
            : (manifest?.email ?? 'p112-hidden@example.invalid'),
        appMetadata: {
          mandoob_role: state.tamper === 'metadata' ? 'employee' : 'super_admin',
          mandoob_status: 'active',
        },
        userMetadata: { full_name: 'P1.12 synthetic acceptance user' },
        emailConfirmed: true,
        factors:
          state.tamper === 'factor'
            ? [
                { factorType: 'totp', status: 'verified' },
                { factorType: 'totp', status: 'verified' },
              ]
            : state.mfaFactors === 1
              ? [{ factorType: 'totp', status: state.factorStatus ?? 'unverified' }]
              : [],
      };
    },
  };
  const secrets = {
    async load() {
      return manifest;
    },
    async save(value: typeof manifest) {
      assert.ok(value);
      mutate(`secrets:save:${value.phase}`, () => {
        manifest = value;
      });
    },
    async remove() {
      mutate('secrets:remove', () => {
        manifest = null;
      });
    },
  };
  return {
    state,
    operations,
    store,
    auth,
    secrets,
    setManifest(value: typeof manifest) {
      manifest = value;
    },
    getManifest() {
      return manifest;
    },
    setFailure(operation: string, timing: 'before' | 'after' = 'after') {
      failure = { operation, timing };
    },
    clearFailure() {
      failure = null;
    },
  };
}

test('setup rejects an unexpected baseline before any fixture mutation', async () => {
  const lifecycle = await import('./lifecycle');
  assert.equal(typeof lifecycle.setupFixture, 'function');
  const fixture = makeFixture();
  fixture.state.authUsers = 1;
  await assert.rejects(() =>
    lifecycle.setupFixture?.({
      guard: { projectId: P112_TARGET.projectId },
      store: fixture.store,
      auth: fixture.auth,
      secrets: fixture.secrets,
      credentials: () => ({ email: 'secret@example.invalid', password: 'secret-password' }),
      log: () => undefined,
    }),
  );
  assert.ok(fixture.operations.length >= 1);
  assert.equal(
    fixture.operations.every(
      (operation) => operation === 'store:read-baseline' || operation === 'secrets:remove',
    ),
    true,
  );
});

test('setup is idempotent and teardown restores the exact baseline for two cycles', async () => {
  const lifecycle = await import('./lifecycle');
  assert.equal(typeof lifecycle.setupFixture, 'function');
  assert.equal(typeof lifecycle.teardownFixture, 'function');
  const fixture = makeFixture();
  const output: string[] = [];
  const credentials = {
    email: 'p112-hidden@example.invalid',
    password: 'p112-hidden-password',
  };
  const deps = {
    guard: { projectId: P112_TARGET.projectId },
    store: fixture.store,
    auth: fixture.auth,
    secrets: fixture.secrets,
    credentials: () => credentials,
    log: (message: string) => output.push(message),
  };

  await lifecycle.setupFixture?.(deps);
  assert.equal(fixture.state.authUsers, 1);
  assert.equal(fixture.state.profiles, 1);
  assert.equal(fixture.state.blogPosts, 2);
  const firstSetupOrder = [
    'secrets:save:planned',
    'auth:create-user',
    'secrets:save:auth-created',
    'store:insert-profile',
    'secrets:save:profile-created',
    'store:insert-content',
    'secrets:save:content-created',
  ].map((operation) => fixture.operations.indexOf(operation));
  assert.deepEqual(
    firstSetupOrder,
    [...firstSetupOrder].sort((left, right) => left - right),
  );
  assert.equal(
    firstSetupOrder.every((index) => index >= 0),
    true,
  );
  await lifecycle.setupFixture?.(deps);
  assert.equal(fixture.state.authUsers, 1);
  assert.equal(fixture.state.profiles, 1);
  assert.equal(fixture.state.blogPosts, 2);
  await lifecycle.teardownFixture?.(deps);
  assert.deepEqual(
    { ...fixture.state, cmsPageSlugs: [...(fixture.state.cmsPageSlugs as string[])] },
    { ...P112_BASELINE, cmsPageSlugs: [...P112_BASELINE.cmsPageSlugs] },
  );
  await lifecycle.setupFixture?.(deps);
  await lifecycle.teardownFixture?.(deps);

  const combined = output.join('\n');
  const emailHash = createHash('sha256').update(credentials.email).digest('hex').slice(0, 16);
  assert.doesNotMatch(combined, /p112-hidden/u);
  assert.doesNotMatch(combined, new RegExp(emailHash, 'u'));
  assert.doesNotMatch(combined, /11200000-0000-4000-8000-000000000099/u);
  assert.deepEqual(
    new Set(fixture.operations),
    new Set([
      'store:read-baseline',
      'store:delete-content',
      'store:delete-user-rows',
      'store:insert-content',
      'store:insert-profile',
      'store:read-fixture',
      'auth:create-user',
      'auth:read-user',
      'auth:delete-user',
      'secrets:save:planned',
      'secrets:save:auth-created',
      'secrets:save:profile-created',
      'secrets:save:content-created',
      'secrets:save:cleanup',
      'secrets:remove',
    ]),
  );
});

test('active fixture verification runs after setup and verify accepts the owned active state', async () => {
  const lifecycle = await import('./lifecycle');
  const fixture = makeFixture();
  const deps = {
    guard: { projectId: P112_TARGET.projectId },
    store: fixture.store,
    auth: fixture.auth,
    secrets: fixture.secrets,
    credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
  };
  await lifecycle.setupFixture(deps);
  const readsAfterSetup = fixture.operations.filter((operation) =>
    operation.endsWith('read-fixture'),
  );
  assert.equal(readsAfterSetup.length, 1);
  await lifecycle.verifyFixtureBaseline(deps);
  assert.equal(
    fixture.operations.filter((operation) => operation.endsWith('read-fixture')).length,
    2,
  );
});

test('every tampered owner invariant aborts teardown before any delete', async () => {
  const lifecycle = await import('./lifecycle');
  for (const tamper of [
    'email',
    'metadata',
    'profile',
    'post',
    'child',
    'factor',
    'event',
    'net',
  ]) {
    const fixture = makeFixture();
    const deps = {
      guard: { projectId: P112_TARGET.projectId },
      store: fixture.store,
      auth: fixture.auth,
      secrets: fixture.secrets,
      credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
    };
    await lifecycle.setupFixture(deps);
    fixture.operations.length = 0;
    fixture.state.tamper = tamper;
    await assert.rejects(() => lifecycle.teardownFixture(deps));
    assert.equal(
      fixture.operations.some((operation) => operation.includes('delete')),
      false,
    );
  }
});

test('accepted MFA stable states verify while partial owned state is teardown-safe', async () => {
  const lifecycle = await import('./lifecycle');
  for (const stable of [
    { factors: 0, recovery: 0, status: undefined },
    { factors: 1, recovery: 0, status: 'unverified' as const },
    {
      factors: 1,
      recovery: 10,
      status: 'verified' as const,
      marker: '2026-09-08T12:00:00.000Z',
    },
  ]) {
    const fixture = makeFixture();
    const deps = {
      guard: { projectId: P112_TARGET.projectId },
      store: fixture.store,
      auth: fixture.auth,
      secrets: fixture.secrets,
      credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
    };
    await lifecycle.setupFixture(deps);
    fixture.state.mfaFactors = stable.factors;
    fixture.state.recoveryCodes = stable.recovery;
    fixture.state.factorStatus = stable.status;
    fixture.state.mfaEnrolledAt = stable.marker ?? null;
    await assert.doesNotReject(() => lifecycle.verifyFixtureBaseline(deps));
  }

  const partial = makeFixture();
  const deps = {
    guard: { projectId: P112_TARGET.projectId },
    store: partial.store,
    auth: partial.auth,
    secrets: partial.secrets,
    credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
  };
  await lifecycle.setupFixture(deps);
  partial.state.mfaFactors = 1;
  partial.state.factorStatus = 'verified';
  partial.state.recoveryCodes = 0;
  partial.state.mfaEnrolledAt = '2026-09-08T12:00:00.000Z';
  await assert.rejects(() => lifecycle.verifyFixtureBaseline(deps));
  await assert.doesNotReject(() => lifecycle.teardownFixture(deps));
});

test('MFA marker must align with stable state while valid partial markers remain cleanup-safe', async () => {
  const lifecycle = await import('./lifecycle');
  for (const mismatch of [
    {
      factors: 0,
      recovery: 0,
      status: undefined,
      marker: '2026-09-08T12:00:00.000Z',
    },
    { factors: 1, recovery: 10, status: 'verified' as const, marker: null },
  ]) {
    const fixture = makeFixture();
    const deps = {
      guard: { projectId: P112_TARGET.projectId },
      store: fixture.store,
      auth: fixture.auth,
      secrets: fixture.secrets,
      credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
    };
    await lifecycle.setupFixture(deps);
    fixture.state.mfaFactors = mismatch.factors;
    fixture.state.recoveryCodes = mismatch.recovery;
    fixture.state.factorStatus = mismatch.status;
    fixture.state.mfaEnrolledAt = mismatch.marker;
    await assert.rejects(() => lifecycle.verifyFixtureBaseline(deps));
    await assert.doesNotReject(() => lifecycle.teardownFixture(deps));
  }

  const malformed = makeFixture();
  const deps = {
    guard: { projectId: P112_TARGET.projectId },
    store: malformed.store,
    auth: malformed.auth,
    secrets: malformed.secrets,
    credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
  };
  await lifecycle.setupFixture(deps);
  malformed.state.tamper = 'marker';
  malformed.operations.length = 0;
  await assert.rejects(() => lifecycle.teardownFixture(deps));
  assert.equal(
    malformed.operations.some((operation) => operation.includes('delete')),
    false,
  );
});

test('exact credential-error event and lockout pair are owned; any other row is rejected', async () => {
  const lifecycle = await import('./lifecycle');
  const fixture = makeFixture();
  const deps = {
    guard: { projectId: P112_TARGET.projectId },
    store: fixture.store,
    auth: fixture.auth,
    secrets: fixture.secrets,
    credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
  };
  await lifecycle.setupFixture(deps);
  fixture.state.authEvents = 1;
  fixture.state.authFailedAttempts = 2;
  fixture.state.failedKeys = ['acct:p112-hidden@example.invalid', 'net:0.0.0.0/24'];
  await assert.doesNotReject(() => lifecycle.verifyFixtureBaseline(deps));
  await assert.doesNotReject(() => lifecycle.teardownFixture(deps));
});

test('the real IPv4 loopback netblock written by browser login is fixture-owned', async () => {
  const lifecycle = await import('./lifecycle');
  const fixture = makeFixture();
  const deps = {
    guard: { projectId: P112_TARGET.projectId },
    store: fixture.store,
    auth: fixture.auth,
    secrets: fixture.secrets,
    credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
  };
  await lifecycle.setupFixture(deps);
  fixture.state.authEvents = 1;
  fixture.state.authFailedAttempts = 1;
  fixture.state.failedKeys = ['net:127.0.0.0/24'];
  await assert.doesNotReject(() => lifecycle.verifyFixtureBaseline(deps));
  await assert.doesNotReject(() => lifecycle.teardownFixture(deps));
});

test('stale manifest is removed without deletes only after exact empty baseline proof', async () => {
  const lifecycle = await import('./lifecycle');
  const fixture = makeFixture();
  fixture.setManifest({
    phase: 'planned',
    email: 'p112-stale@example.invalid',
    password: 'hidden-password',
    userId: '11200000-0000-4000-8000-000000000099',
  });
  await lifecycle.teardownFixture({
    guard: { projectId: P112_TARGET.projectId },
    store: fixture.store,
    auth: fixture.auth,
    secrets: fixture.secrets,
  });
  assert.equal(fixture.getManifest(), null);
  assert.ok(fixture.operations.length >= 1);
  assert.equal(
    fixture.operations.every(
      (operation) => operation === 'store:read-baseline' || operation === 'secrets:remove',
    ),
    true,
  );
});

test('setup journals every create phase and failure cleanup restores baseline', async () => {
  const lifecycle = await import('./lifecycle');
  for (const operation of [
    'secrets:save:planned',
    'auth:create-user',
    'secrets:save:auth-created',
    'store:insert-profile',
    'secrets:save:profile-created',
    'store:insert-content',
    'secrets:save:content-created',
  ]) {
    const fixture = makeFixture();
    fixture.setFailure(operation);
    await assert.rejects(
      () =>
        lifecycle.setupFixture({
          guard: { projectId: P112_TARGET.projectId },
          store: fixture.store,
          auth: fixture.auth,
          secrets: fixture.secrets,
          credentials: () => ({
            email: 'p112-hidden@example.invalid',
            password: 'hidden-password',
          }),
        }),
      /P1\.12 fixture setup failed/u,
    );
    assert.deepEqual(
      { ...fixture.state, cmsPageSlugs: [...(fixture.state.cmsPageSlugs as string[])] },
      { ...P112_BASELINE, cmsPageSlugs: [...P112_BASELINE.cmsPageSlugs] },
    );
    assert.equal(fixture.getManifest(), null);
  }
});

test('planned manifest recovers the exact Auth user by email after create-response crash', async () => {
  const lifecycle = await import('./lifecycle');
  const fixture = makeFixture();
  fixture.setManifest({
    phase: 'planned',
    email: 'p112-hidden@example.invalid',
    password: 'hidden-password',
  });
  fixture.state.authUsers = 1;
  await lifecycle.teardownFixture({
    guard: { projectId: P112_TARGET.projectId },
    store: fixture.store,
    auth: fixture.auth,
    secrets: fixture.secrets,
  });
  assert.ok(fixture.operations.indexOf('store:find-user-by-email') >= 0);
  assert.equal(fixture.getManifest(), null);
  assert.equal(fixture.state.authUsers, 0);
});

test('cleanup restart is idempotent after each delete/save failure and retains its manifest', async () => {
  const lifecycle = await import('./lifecycle');
  for (const [operation, timing] of [
    ['secrets:save:cleanup', 'after'],
    ['store:delete-content', 'after'],
    ['store:delete-user-rows', 'after'],
    ['auth:delete-user', 'after'],
    ['secrets:remove', 'before'],
  ] as const) {
    const fixture = makeFixture();
    const deps = {
      guard: { projectId: P112_TARGET.projectId },
      store: fixture.store,
      auth: fixture.auth,
      secrets: fixture.secrets,
      credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
    };
    await lifecycle.setupFixture(deps);
    fixture.setFailure(operation, timing);
    await assert.rejects(() => lifecycle.teardownFixture(deps));
    assert.equal(fixture.getManifest()?.phase, 'cleanup');
    fixture.clearFailure();
    await assert.doesNotReject(() => lifecycle.teardownFixture(deps));
    assert.equal(fixture.getManifest(), null);
  }

  const fixture = makeFixture();
  const deps = {
    guard: { projectId: P112_TARGET.projectId },
    store: fixture.store,
    auth: fixture.auth,
    secrets: fixture.secrets,
    credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
  };
  await lifecycle.setupFixture(deps);
  fixture.setFailure('auth:delete-user', 'before');
  await assert.rejects(() => lifecycle.teardownFixture(deps));
  assert.equal(fixture.getManifest()?.phase, 'cleanup');
  assert.equal(fixture.state.authUsers, 1);
  fixture.clearFailure();
  await lifecycle.teardownFixture(deps);
  assert.equal(fixture.getManifest(), null);
});

test('setup failure keeps the cleanup manifest when exact cleanup also fails', async () => {
  const lifecycle = await import('./lifecycle');
  const fixture = makeFixture();
  const originalInsert = fixture.store.insertFixtureContent;
  fixture.store.insertFixtureContent = async (rows) => {
    await originalInsert(rows);
    fixture.setFailure('store:delete-content', 'before');
    throw new Error('sensitive injected setup detail');
  };
  await assert.rejects(
    () =>
      lifecycle.setupFixture({
        guard: { projectId: P112_TARGET.projectId },
        store: fixture.store,
        auth: fixture.auth,
        secrets: fixture.secrets,
        credentials: () => ({ email: 'p112-hidden@example.invalid', password: 'hidden-password' }),
      }),
    (error: Error) => {
      assert.equal(error.message, 'P1.12 fixture setup failed and exact cleanup remains required');
      return true;
    },
  );
  assert.equal(fixture.getManifest()?.phase, 'cleanup');
  assert.equal(fixture.state.authUsers, 1);
  assert.equal(fixture.state.blogPosts, 2);
});

test('cleanup never deletes a phase-incompatible or unproven partial fixture', async () => {
  const lifecycle = await import('./lifecycle');
  const fixture = makeFixture();
  fixture.setManifest({
    phase: 'cleanup',
    email: 'p112-hidden@example.invalid',
    password: 'hidden-password',
    userId: '11200000-0000-4000-8000-000000000099',
  });
  fixture.state.authUsers = 1;
  fixture.state.blogPosts = 2;
  await assert.rejects(() =>
    lifecycle.teardownFixture({
      guard: { projectId: P112_TARGET.projectId },
      store: fixture.store,
      auth: fixture.auth,
      secrets: fixture.secrets,
    }),
  );
  assert.equal(
    fixture.operations.some((operation) => operation.includes('delete')),
    false,
  );
  assert.equal(fixture.getManifest()?.phase, 'cleanup');
});

test('pre-active manifest phases reject non-initial security activity before cleanup writes', async () => {
  const lifecycle = await import('./lifecycle');
  const fixture = makeFixture();
  fixture.setManifest({
    phase: 'auth-created',
    email: 'p112-hidden@example.invalid',
    password: 'hidden-password',
    userId: '11200000-0000-4000-8000-000000000099',
  });
  fixture.state.authUsers = 1;
  fixture.state.authEvents = 1;
  await assert.rejects(() =>
    lifecycle.teardownFixture({
      guard: { projectId: P112_TARGET.projectId },
      store: fixture.store,
      auth: fixture.auth,
      secrets: fixture.secrets,
    }),
  );
  assert.equal(
    fixture.operations.some(
      (operation) => operation.includes('delete') || operation === 'secrets:save:cleanup',
    ),
    false,
  );
  assert.equal(fixture.getManifest()?.phase, 'auth-created');
});

test('wrong guard identity fails closed before reads or writes', async () => {
  const lifecycle = await import('./lifecycle');
  const fixture = makeFixture();
  await assert.rejects(() =>
    lifecycle.setupFixture?.({
      guard: { projectId: 'mandoob' },
      store: fixture.store,
      auth: fixture.auth,
      secrets: fixture.secrets,
      credentials: () => ({ email: 'secret@example.invalid', password: 'secret-password' }),
      log: () => undefined,
    }),
  );
  assert.deepEqual(fixture.operations, []);
});
