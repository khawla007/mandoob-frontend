import { assertExactBaseline, type BaselineSnapshot } from './baseline';
import { P112_BASELINE, P112_FIXTURE, P112_TARGET } from './contract';
import { generateRuntimeCredentials, type RuntimeSecrets } from './secrets';

export type FixturePost = {
  id: string;
  slug: string;
  status: 'published' | 'draft';
  title: string;
  excerpt: string;
  contentHtml: string;
  contentJson: Record<string, unknown>;
  publishedAt: string | null;
  noindex: boolean;
};

export type FixtureStore = {
  readBaseline(): Promise<BaselineSnapshot | unknown>;
  findFixtureUserIdByEmail(email: string): Promise<string | null>;
  readFixtureState(userId: string, email: string): Promise<FixtureDatabaseState | unknown>;
  deleteFixtureContent(ids: readonly string[]): Promise<void>;
  deleteFixtureUserRows(userId: string, email: string): Promise<void>;
  insertFixtureContent(rows: readonly FixturePost[]): Promise<void>;
  insertProfile(input: { id: string; role: 'super_admin'; status: 'active' }): Promise<void>;
};

export type FixtureAuth = {
  createUser(input: {
    email: string;
    password: string;
    appMetadata: { mandoob_role: 'super_admin'; mandoob_status: 'active' };
  }): Promise<string>;
  readUser(userId: string): Promise<FixtureAuthUser | null>;
  deleteUser(userId: string): Promise<void>;
};

export type FixtureAuthUser = {
  id: string;
  email: string;
  appMetadata: { mandoob_role?: unknown; mandoob_status?: unknown };
  userMetadata: { full_name?: unknown };
  emailConfirmed: boolean;
  factors: Array<{ factorType: string; status: string }>;
};

export type FixtureDatabaseState = {
  profile: {
    id: string;
    role: string;
    status: string;
    fullName: string | null;
    mfaEnrolledAt: string | null;
  } | null;
  posts: Array<{
    id: string;
    slug: string;
    status: string;
    noindex: boolean;
    title: string;
    contentHtml: string;
  }>;
  blogMedia: number;
  blogTerms: number;
  blogPostTerms: number;
  blogPostGalleryItems: number;
  blogPostRevisions: number;
  recoveryCodes: number;
  rateLimitKeys: string[];
  authEventsTotal: number;
  unownedAuthEvents: number;
  authFailedAttemptsTotal: number;
  authFailedAttemptKeys: string[];
};

export type FixtureSecrets = {
  load(): Promise<RuntimeSecrets | null>;
  save(value: RuntimeSecrets): Promise<void>;
  remove(): Promise<void>;
};

type LifecycleDependencies = {
  guard: { projectId: string };
  store: FixtureStore;
  auth: FixtureAuth;
  secrets: FixtureSecrets;
  credentials?: () => Pick<RuntimeSecrets, 'email' | 'password'>;
  log?: (message: string) => void;
};

const fixturePostIds = [P112_FIXTURE.publishedPostId, P112_FIXTURE.unpublishedPostId] as const;

const fixturePosts: readonly FixturePost[] = [
  {
    id: P112_FIXTURE.publishedPostId,
    slug: P112_FIXTURE.publishedPostSlug,
    status: 'published',
    title: 'P1.12 public acceptance fixture',
    excerpt: 'Synthetic local content used only for public presentation acceptance.',
    contentHtml:
      '<p>This synthetic local post verifies the published Blog detail presentation.</p>',
    contentJson: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'This synthetic local post verifies the published Blog detail presentation.',
            },
          ],
        },
      ],
    },
    publishedAt: '2026-09-08T00:00:00.000Z',
    noindex: true,
  },
  {
    id: P112_FIXTURE.unpublishedPostId,
    slug: P112_FIXTURE.unpublishedPostSlug,
    status: 'draft',
    title: 'P1.12 unpublished acceptance fixture',
    excerpt: 'Synthetic unpublished content that must never appear publicly.',
    contentHtml: '<p>This draft must remain unavailable to public readers.</p>',
    contentJson: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This draft must remain unavailable to public readers.' },
          ],
        },
      ],
    },
    publishedAt: null,
    noindex: true,
  },
];

function assertGuard(deps: LifecycleDependencies): void {
  if (deps.guard.projectId !== P112_TARGET.projectId) {
    throw new Error('P1.12 lifecycle target rejected');
  }
}

function assertUserId(userId: string | undefined): asserts userId is string {
  if (
    !userId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(userId)
  ) {
    throw new Error('P1.12 fixture user identity unreadable');
  }
}

function assertFixtureEmail(email: string): void {
  if (!/^p112-[a-zA-Z0-9_-]+@example\.invalid$/u.test(email)) {
    throw new Error('P1.12 fixture email rejected');
  }
}

function isExactBaseline(value: unknown): boolean {
  try {
    assertExactBaseline(value);
    return true;
  } catch {
    return false;
  }
}

function isValidMfaTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

type OwnedStage = 'auth-created' | 'profile-created' | 'content-created';

function assertSnapshotShape(
  value: unknown,
  database: FixtureDatabaseState,
  expected: { authUsers: number; profiles: number; blogPosts: number },
): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('P1.12 fixture counts unreadable');
  const counts = value as Record<string, unknown>;
  const fixed = {
    ...expected,
    blogMedia: 0,
    blogTerms: 0,
    blogPostTerms: 0,
    blogPostGalleryItems: 0,
    blogPostRevisions: 0,
    cmsPages: 4,
    storageObjects: 0,
  };
  for (const [key, expectedValue] of Object.entries(fixed)) {
    if (counts[key] !== expectedValue) throw new Error(`P1.12 active count mismatch: ${key}`);
  }
  if (counts.cmsPagesAreLivePublished !== true) throw new Error('P1.12 CMS state mismatch');
  const slugs = counts.cmsPageSlugs;
  if (
    !Array.isArray(slugs) ||
    slugs.slice().sort().join('\n') !== [...P112_BASELINE.cmsPageSlugs].sort().join('\n')
  ) {
    throw new Error('P1.12 CMS state mismatch');
  }
  if (counts.rateLimits !== database.rateLimitKeys.length) {
    throw new Error('P1.12 rate-limit count mismatch');
  }
  return counts;
}

function expectedPostsMatch(database: FixtureDatabaseState, expectedCount: 0 | 2): void {
  if (database.posts.length !== expectedCount) throw new Error('P1.12 Blog fixture count mismatch');
  if (expectedCount === 0) return;
  const expectedPosts = new Map(fixturePosts.map((post) => [post.id, post]));
  for (const actual of database.posts) {
    const expected = expectedPosts.get(actual.id);
    if (
      !expected ||
      actual.slug !== expected.slug ||
      actual.status !== expected.status ||
      actual.noindex !== expected.noindex ||
      actual.title !== expected.title ||
      actual.contentHtml !== expected.contentHtml
    ) {
      throw new Error('P1.12 Blog fixture ownership mismatch');
    }
  }
}

async function inspectOwnedStage(
  deps: LifecycleDependencies,
  manifest: RuntimeSecrets,
  counts: unknown,
  requiredState: 'ownership' | 'setup-partial' | 'stable' | 'initial' = 'ownership',
): Promise<OwnedStage> {
  assertUserId(manifest.userId);
  assertFixtureEmail(manifest.email);
  const [authUser, rawDatabase] = await Promise.all([
    deps.auth.readUser(manifest.userId),
    deps.store.readFixtureState(manifest.userId, manifest.email),
  ]);
  if (!authUser || !rawDatabase || typeof rawDatabase !== 'object') {
    throw new Error('P1.12 fixture ownership unreadable');
  }
  const database = rawDatabase as FixtureDatabaseState;
  const rawCounts = counts as Record<string, unknown>;
  let stage: OwnedStage;
  if (rawCounts.authUsers === 1 && rawCounts.profiles === 0 && rawCounts.blogPosts === 0) {
    stage = 'auth-created';
  } else if (rawCounts.authUsers === 1 && rawCounts.profiles === 1 && rawCounts.blogPosts === 0) {
    stage = 'profile-created';
  } else if (rawCounts.authUsers === 1 && rawCounts.profiles === 1 && rawCounts.blogPosts === 2) {
    stage = 'content-created';
  } else {
    throw new Error('P1.12 fixture phase state mismatch');
  }
  const checkedCounts = assertSnapshotShape(counts, database, {
    authUsers: 1,
    profiles: stage === 'auth-created' ? 0 : 1,
    blogPosts: stage === 'content-created' ? 2 : 0,
  });
  if (
    authUser.id !== manifest.userId ||
    authUser.email.toLowerCase() !== manifest.email.toLowerCase() ||
    authUser.appMetadata.mandoob_role !== 'super_admin' ||
    authUser.appMetadata.mandoob_status !== 'active' ||
    authUser.userMetadata.full_name !== 'P1.12 synthetic acceptance user' ||
    authUser.emailConfirmed !== true
  ) {
    throw new Error('P1.12 Auth fixture ownership mismatch');
  }
  if (stage === 'auth-created') {
    if (database.profile !== null) throw new Error('P1.12 unexpected fixture profile');
  } else {
    if (
      !database.profile ||
      database.profile.id !== manifest.userId ||
      database.profile.role !== 'super_admin' ||
      database.profile.status !== 'active' ||
      database.profile.fullName !== 'P1.12 synthetic acceptance user'
    ) {
      throw new Error('P1.12 profile fixture ownership mismatch');
    }
  }
  expectedPostsMatch(database, stage === 'content-created' ? 2 : 0);
  for (const count of [
    database.blogMedia,
    database.blogTerms,
    database.blogPostTerms,
    database.blogPostGalleryItems,
    database.blogPostRevisions,
  ]) {
    if (count !== 0) throw new Error('P1.12 unexpected fixture child state');
  }
  if (
    authUser.factors.length > 1 ||
    authUser.factors.some(
      (factor) =>
        factor.factorType !== 'totp' ||
        (factor.status !== 'unverified' && factor.status !== 'verified'),
    ) ||
    !Number.isInteger(database.recoveryCodes) ||
    database.recoveryCodes < 0 ||
    database.recoveryCodes > 10 ||
    checkedCounts.mfaFactors !== authUser.factors.length ||
    checkedCounts.recoveryCodes !== database.recoveryCodes ||
    (stage === 'auth-created' && database.recoveryCodes !== 0)
  ) {
    throw new Error('P1.12 MFA ownership mismatch');
  }
  const mfaEnrolledAt = database.profile?.mfaEnrolledAt ?? null;
  if (database.profile && mfaEnrolledAt !== null && !isValidMfaTimestamp(mfaEnrolledAt)) {
    throw new Error('P1.12 MFA enrollment marker unreadable');
  }
  const allowedRateLimits = new Set([
    'login:0.0.0.0',
    'login:127.0.0.1',
    `mfa-enroll:${manifest.userId}`,
    `mfa-verify:${manifest.userId}`,
    `mfa-recovery:${manifest.userId}`,
  ]);
  if (
    new Set(database.rateLimitKeys).size !== database.rateLimitKeys.length ||
    database.rateLimitKeys.some((key) => !allowedRateLimits.has(key))
  ) {
    throw new Error('P1.12 rate-limit fixture ownership mismatch');
  }
  const allowedFailedKeys = new Set([
    `acct:${manifest.email.toLowerCase()}`,
    'net:0.0.0.0/24',
    'net:127.0.0.0/24',
  ]);
  if (
    database.unownedAuthEvents !== 0 ||
    checkedCounts.authEvents !== database.authEventsTotal ||
    new Set(database.authFailedAttemptKeys).size !== database.authFailedAttemptKeys.length ||
    database.authFailedAttemptKeys.some((key) => !allowedFailedKeys.has(key)) ||
    database.authFailedAttemptsTotal !== database.authFailedAttemptKeys.length ||
    checkedCounts.authFailedAttempts !== database.authFailedAttemptsTotal
  ) {
    throw new Error('P1.12 auth activity ownership mismatch');
  }
  if (requiredState === 'setup-partial') {
    if (
      authUser.factors.length !== 0 ||
      database.recoveryCodes !== 0 ||
      (database.profile?.mfaEnrolledAt !== null && database.profile?.mfaEnrolledAt !== undefined) ||
      checkedCounts.authEvents !== 0 ||
      checkedCounts.authFailedAttempts !== 0 ||
      checkedCounts.rateLimits !== 0
    ) {
      throw new Error('P1.12 pre-active fixture state mismatch');
    }
  } else if (requiredState !== 'ownership') {
    if (stage !== 'content-created') {
      throw new Error('P1.12 fixture is not acceptance-complete');
    }
    const factor = authUser.factors[0];
    const stable =
      (authUser.factors.length === 0 && database.recoveryCodes === 0 && mfaEnrolledAt === null) ||
      (authUser.factors.length === 1 &&
        factor?.status === 'unverified' &&
        database.recoveryCodes === 0 &&
        mfaEnrolledAt === null) ||
      (authUser.factors.length === 1 &&
        factor?.status === 'verified' &&
        database.recoveryCodes === 10 &&
        isValidMfaTimestamp(mfaEnrolledAt));
    const initial =
      authUser.factors.length === 0 && database.recoveryCodes === 0 && mfaEnrolledAt === null;
    if (!stable || (requiredState === 'initial' && !initial)) {
      throw new Error('P1.12 MFA state is owned but not acceptance-stable');
    }
  }
  return stage;
}

async function resolvePlannedManifest(
  deps: LifecycleDependencies,
  manifest: RuntimeSecrets,
  counts: unknown,
): Promise<RuntimeSecrets | null> {
  if (manifest.phase !== 'planned' || manifest.userId) {
    assertUserId(manifest.userId);
    return manifest;
  }
  if (isExactBaseline(counts)) return null;
  if (
    !counts ||
    typeof counts !== 'object' ||
    (counts as Record<string, unknown>).authUsers !== 1 ||
    (counts as Record<string, unknown>).profiles !== 0 ||
    (counts as Record<string, unknown>).blogPosts !== 0
  ) {
    throw new Error('P1.12 planned fixture recovery mismatch');
  }
  const userId = await deps.store.findFixtureUserIdByEmail(manifest.email);
  if (!userId) throw new Error('P1.12 planned fixture recovery mismatch');
  assertUserId(userId);
  const recovered: RuntimeSecrets = { ...manifest, phase: 'auth-created', userId };
  await inspectOwnedStage(deps, recovered, counts, 'setup-partial');
  const recoveryCounts = counts as Record<string, unknown>;
  for (const key of [
    'mfaFactors',
    'recoveryCodes',
    'authEvents',
    'authFailedAttempts',
    'rateLimits',
  ]) {
    if (recoveryCounts[key] !== 0) throw new Error('P1.12 planned fixture recovery mismatch');
  }
  await deps.secrets.save(recovered);
  return recovered;
}

function phaseAcceptsStage(phase: RuntimeSecrets['phase'], stage: OwnedStage): boolean {
  if (phase === 'cleanup') return true;
  if (phase === 'auth-created') return stage === 'auth-created' || stage === 'profile-created';
  if (phase === 'profile-created')
    return stage === 'profile-created' || stage === 'content-created';
  return phase === 'content-created' && stage === 'content-created';
}

async function cleanupKnownFixture(
  deps: LifecycleDependencies,
  originalManifest: RuntimeSecrets,
): Promise<void> {
  const counts = await deps.store.readBaseline();
  if (isExactBaseline(counts)) {
    assertExactBaseline(counts);
    await deps.secrets.remove();
    return;
  }
  const resolved = await resolvePlannedManifest(deps, originalManifest, counts);
  if (!resolved) {
    assertExactBaseline(counts);
    await deps.secrets.remove();
    return;
  }
  const initialStage = await inspectOwnedStage(
    deps,
    resolved,
    counts,
    resolved.phase === 'auth-created' || resolved.phase === 'profile-created'
      ? 'setup-partial'
      : 'ownership',
  );
  if (!phaseAcceptsStage(resolved.phase, initialStage)) {
    throw new Error('P1.12 manifest phase mismatch');
  }
  const cleanupManifest: RuntimeSecrets = { ...resolved, phase: 'cleanup' };
  await deps.secrets.save(cleanupManifest);

  for (;;) {
    const currentCounts = await deps.store.readBaseline();
    if (isExactBaseline(currentCounts)) {
      assertExactBaseline(currentCounts);
      await deps.secrets.remove();
      return;
    }
    const stage = await inspectOwnedStage(deps, cleanupManifest, currentCounts, 'ownership');
    if (stage === 'content-created') {
      await deps.store.deleteFixtureContent(fixturePostIds);
    } else if (stage === 'profile-created') {
      await deps.store.deleteFixtureUserRows(cleanupManifest.userId!, cleanupManifest.email);
    } else {
      await deps.auth.deleteUser(cleanupManifest.userId!);
    }
  }
}

async function verifyBaseline(deps: LifecycleDependencies): Promise<void> {
  assertExactBaseline(await deps.store.readBaseline());
}

export async function setupFixture(deps: LifecycleDependencies): Promise<{
  userAlias: string;
  contentAliases: readonly string[];
}> {
  assertGuard(deps);
  const existing = await deps.secrets.load();
  if (existing) await cleanupKnownFixture(deps, existing);
  await verifyBaseline(deps);

  const credentials = (deps.credentials ?? generateRuntimeCredentials)();
  if (!credentials.email || !credentials.password) throw new Error('P1.12 credentials unreadable');
  assertFixtureEmail(credentials.email);
  const planned: RuntimeSecrets = { ...credentials, phase: 'planned' };
  try {
    await deps.secrets.save(planned);
    const createdUserId = await deps.auth.createUser({
      ...credentials,
      appMetadata: { mandoob_role: 'super_admin', mandoob_status: 'active' },
    });
    assertUserId(createdUserId);
    const authCreated: RuntimeSecrets = {
      ...planned,
      phase: 'auth-created',
      userId: createdUserId,
    };
    await deps.secrets.save(authCreated);
    await deps.store.insertProfile({ id: createdUserId, role: 'super_admin', status: 'active' });
    const profileCreated: RuntimeSecrets = { ...authCreated, phase: 'profile-created' };
    await deps.secrets.save(profileCreated);
    await deps.store.insertFixtureContent(fixturePosts);
    const contentCreated: RuntimeSecrets = { ...profileCreated, phase: 'content-created' };
    await deps.secrets.save(contentCreated);
    await inspectOwnedStage(deps, contentCreated, await deps.store.readBaseline(), 'initial');
  } catch {
    try {
      const recoveryManifest = await deps.secrets.load();
      if (recoveryManifest) await cleanupKnownFixture(deps, recoveryManifest);
      else await verifyBaseline(deps);
    } catch {
      throw new Error('P1.12 fixture setup failed and exact cleanup remains required');
    }
    throw new Error('P1.12 fixture setup failed after exact cleanup');
  }
  deps.log?.('P1.12 fixture setup complete: mfa-user, published-blog-post, unpublished-blog-post');
  return {
    userAlias: P112_FIXTURE.userAlias,
    contentAliases: [P112_FIXTURE.publishedPostAlias, P112_FIXTURE.unpublishedPostAlias],
  };
}

export async function teardownFixture(deps: LifecycleDependencies): Promise<void> {
  assertGuard(deps);
  const existing = await deps.secrets.load();
  if (existing) await cleanupKnownFixture(deps, existing);
  await verifyBaseline(deps);
  deps.log?.('P1.12 fixture teardown complete: exact baseline restored');
}

export async function verifyFixtureBaseline(deps: LifecycleDependencies): Promise<void> {
  assertGuard(deps);
  const existing = await deps.secrets.load();
  const counts = await deps.store.readBaseline();
  if (existing) {
    if (existing.phase !== 'content-created') {
      throw new Error('P1.12 fixture is not acceptance-complete');
    }
    await inspectOwnedStage(deps, existing, counts, 'stable');
  } else assertExactBaseline(counts);
}
