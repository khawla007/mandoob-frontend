import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import { P112_FIXTURE, P112_TARGET } from './contract';

test('Postgres adapter targets only the exact local container and fixture tables', async () => {
  const adapters = await import('./adapters');
  assert.equal(typeof adapters.createPostgresFixtureStore, 'function');
  const calls: Array<{ file: string; args: readonly string[]; stdin?: string }> = [];
  const snapshot = {
    authUsers: 0,
    profiles: 0,
    mfaFactors: 0,
    recoveryCodes: 0,
    authEvents: 0,
    authFailedAttempts: 0,
    rateLimits: 0,
    blogMedia: 0,
    blogPosts: 0,
    blogTerms: 0,
    blogPostTerms: 0,
    blogPostGalleryItems: 0,
    blogPostRevisions: 0,
    cmsPages: 4,
    storageObjects: 0,
    cmsPageSlugs: ['pdpl', 'privacy', 'terms', 'trust'],
    cmsPagesAreLivePublished: true,
  };
  const fixtureState = {
    profile: null,
    posts: [],
    blogMedia: 0,
    blogTerms: 0,
    blogPostTerms: 0,
    blogPostGalleryItems: 0,
    blogPostRevisions: 0,
    recoveryCodes: 0,
    rateLimitKeys: [],
    authEventsTotal: 0,
    unownedAuthEvents: 0,
    authFailedAttemptsTotal: 0,
    authFailedAttemptKeys: [],
  };
  const store = adapters.createPostgresFixtureStore?.(async (file, args, stdin) => {
    calls.push({ file, args, stdin });
    if (stdin?.includes("'cmsPageSlugs'")) return `${JSON.stringify(snapshot)}\n`;
    if (stdin?.includes("'unownedAuthEvents'")) return `${JSON.stringify(fixtureState)}\n`;
    if (stdin?.includes('from auth.users where lower(email)')) {
      return `${JSON.stringify(['11200000-0000-4000-8000-000000000099'])}\n`;
    }
    return '';
  });
  assert.deepEqual(await store?.readBaseline(), snapshot);
  assert.equal(
    await store?.findFixtureUserIdByEmail('p112-hidden@example.invalid'),
    '11200000-0000-4000-8000-000000000099',
  );
  await store?.readFixtureState(
    '11200000-0000-4000-8000-000000000099',
    'p112-hidden@example.invalid',
  );
  await store?.insertFixtureContent([
    {
      id: P112_FIXTURE.publishedPostId,
      slug: P112_FIXTURE.publishedPostSlug,
      status: 'published',
      title: 'title',
      excerpt: 'excerpt',
      contentHtml: '<p>safe</p>',
      contentJson: {},
      publishedAt: '2026-09-08T00:00:00.000Z',
      noindex: true,
    },
  ]);
  await store?.deleteFixtureUserRows(
    '11200000-0000-4000-8000-000000000099',
    'p112-hidden@example.invalid',
  );
  assert.ok(calls.every((call) => call.file === 'docker'));
  assert.ok(
    calls.every(
      (call) => call.args.includes(P112_TARGET.databaseContainer) && call.args.includes('psql'),
    ),
  );
  const sql = calls.map((call) => call.stdin ?? '').join('\n');
  assert.match(sql, /public\.blog_posts/u);
  assert.match(
    sql,
    /from auth\.users where lower\(email\) = lower\('p112-hidden@example\.invalid'\)/u,
  );
  assert.match(
    sql,
    /public\.auth_failed_attempts where key in \('acct:p112-hidden@example\.invalid', 'net:0\.0\.0\.0\/24', 'net:127\.0\.0\.0\/24'\)/u,
  );
  assert.match(sql, /'net:0\.0\.0\.0\/24'/u);
  assert.match(sql, /'net:127\.0\.0\.0\/24'/u);
  const emailHash = createHash('sha256')
    .update('p112-hidden@example.invalid')
    .digest('hex')
    .slice(0, 16);
  const persistedLoginFailureDetails = { email_hash: emailHash };
  const rawLoginFailureDetails = { email: 'p112-hidden@example.invalid' };
  assert.equal(Object.keys(persistedLoginFailureDetails).join(), 'email_hash');
  assert.equal(Object.keys(rawLoginFailureDetails).join(), 'email');
  assert.equal(
    sql.match(
      new RegExp(`details->>'email_hash' = '${persistedLoginFailureDetails.email_hash}'`, 'gu'),
    )?.length,
    2,
  );
  assert.doesNotMatch(sql, /details->>'email'|email_hash' = 'p112-hidden/iu);
  assert.match(sql, /'mfaEnrolledAt', mfa_enrolled_at/u);
  assert.match(sql, /actor_user_id = '11200000-0000-4000-8000-000000000099'::uuid/u);
  assert.match(
    sql,
    /public\.rate_limits where key in \('login:0\.0\.0\.0', 'login:127\.0\.0\.1', 'mfa-enroll:11200000-0000-4000-8000-000000000099', 'mfa-verify:11200000-0000-4000-8000-000000000099', 'mfa-recovery:11200000-0000-4000-8000-000000000099'\)/u,
  );
  assert.doesNotMatch(
    sql.replaceAll('login:0.0.0.0', '').replaceAll('login:127.0.0.1', ''),
    /login:/u,
  );
  assert.doesNotMatch(sql, /\blike\b|%/iu);
  assert.doesNotMatch(sql, /public\.(leads|applications|documents|tenants)\b/u);
});

test('runtime project preparation copies only migrations/seed and writes exact owner-only config', async () => {
  const runtime = await import('./runtime-project');
  assert.equal(typeof runtime.prepareRuntimeProject, 'function');
  assert.equal(typeof runtime.cleanupRuntimeProject, 'function');
  const parent = await mkdtemp(join(tmpdir(), 'p112-project-test-'));
  const root = join(parent, '.p1-12-acceptance-runtime');
  const prepared = await runtime.prepareRuntimeProject?.({
    sourceSupabaseDirectory: join(process.cwd(), 'supabase'),
    runtimeRoot: root,
  });
  assert.equal(prepared?.workdir, root);
  assert.equal(basename(prepared?.configPath ?? ''), 'config.toml');
  assert.equal((await stat(root)).mode & 0o777, 0o700);
  const config = await readFile(join(root, 'supabase', 'config.toml'), 'utf8');
  assert.match(config, /project_id = "mandoob-p1-12-acceptance"/u);
  assert.match(config, /port = 56321/u);
  assert.equal(await stat(join(root, 'supabase', 'migrations')).then(() => true), true);
  await assert.rejects(() =>
    runtime.prepareRuntimeProject?.({
      sourceSupabaseDirectory: join(process.cwd(), 'supabase'),
      runtimeRoot: root,
    }),
  );
  await runtime.cleanupRuntimeProject?.(root);
  await assert.rejects(stat(root), { code: 'ENOENT' });
  await assert.rejects(() => runtime.cleanupRuntimeProject?.(parent));
});

test('runtime preparation accepts only an absent or exact empty root', async () => {
  const runtime = await import('./runtime-project');
  const parent = await mkdtemp(join(tmpdir(), 'p112-project-state-test-'));
  const emptyRoot = join(parent, '.p1-12-acceptance-runtime');
  await mkdir(emptyRoot);
  await assert.doesNotReject(() =>
    runtime.prepareRuntimeProject?.({
      sourceSupabaseDirectory: join(process.cwd(), 'supabase'),
      runtimeRoot: emptyRoot,
    }),
  );
  await runtime.cleanupRuntimeProject?.(emptyRoot);
  await mkdir(emptyRoot);
  await writeFile(join(emptyRoot, 'stale.txt'), 'unexpected');
  await assert.rejects(() =>
    runtime.prepareRuntimeProject?.({
      sourceSupabaseDirectory: join(process.cwd(), 'supabase'),
      runtimeRoot: emptyRoot,
    }),
  );
});

test('Auth adapter creates and deletes only one exact synthetic identity without listing users', async () => {
  const adapters = await import('./adapters');
  assert.equal(typeof adapters.createAuthFixture, 'function');
  const calls: Array<{ operation: string; value: unknown }> = [];
  const auth = adapters.createAuthFixture?.({
    auth: {
      admin: {
        async createUser(value: unknown) {
          calls.push({ operation: 'create', value });
          return {
            data: { user: { id: '11200000-0000-4000-8000-000000000099' } },
            error: null,
          };
        },
        async deleteUser(value: string) {
          calls.push({ operation: 'delete', value });
          return { error: null };
        },
        async getUserById(value: string) {
          calls.push({ operation: 'read', value });
          return {
            data: {
              user: {
                id: value,
                email: 'p112-hidden@example.invalid',
                email_confirmed_at: '2026-09-08T00:00:00.000Z',
                app_metadata: { mandoob_role: 'super_admin', mandoob_status: 'active' },
                user_metadata: { full_name: 'P1.12 synthetic acceptance user' },
                factors: [],
              },
            },
            error: null,
          };
        },
      },
    },
  });
  const userId = await auth?.createUser({
    email: 'p112-hidden@example.invalid',
    password: 'p112-hidden-password',
    appMetadata: { mandoob_role: 'super_admin', mandoob_status: 'active' },
  });
  assert.deepEqual(await auth?.readUser(userId ?? ''), {
    id: '11200000-0000-4000-8000-000000000099',
    email: 'p112-hidden@example.invalid',
    emailConfirmed: true,
    appMetadata: { mandoob_role: 'super_admin', mandoob_status: 'active' },
    userMetadata: { full_name: 'P1.12 synthetic acceptance user' },
    factors: [],
  });
  await auth?.deleteUser(userId ?? '');
  assert.deepEqual(calls, [
    {
      operation: 'create',
      value: {
        email: 'p112-hidden@example.invalid',
        password: 'p112-hidden-password',
        email_confirm: true,
        user_metadata: { full_name: 'P1.12 synthetic acceptance user' },
        app_metadata: { mandoob_role: 'super_admin', mandoob_status: 'active' },
      },
    },
    { operation: 'read', value: '11200000-0000-4000-8000-000000000099' },
    { operation: 'delete', value: '11200000-0000-4000-8000-000000000099' },
  ]);
});
