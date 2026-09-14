import { createHash } from 'node:crypto';

import { P112_FIXTURE, P112_TARGET } from './contract';
import type { FixtureAuth, FixturePost, FixtureStore } from './lifecycle';

export type CommandRunner = (
  file: string,
  args: readonly string[],
  stdin?: string,
) => Promise<string>;

const BASELINE_SQL = `
select json_build_object(
  'authUsers', (select count(*)::int from auth.users),
  'profiles', (select count(*)::int from public.profiles),
  'mfaFactors', (select count(*)::int from auth.mfa_factors),
  'recoveryCodes', (select count(*)::int from public.user_mfa_recovery_codes),
  'authEvents', (select count(*)::int from public.auth_events),
  'authFailedAttempts', (select count(*)::int from public.auth_failed_attempts),
  'rateLimits', (select count(*)::int from public.rate_limits),
  'blogMedia', (select count(*)::int from public.blog_media),
  'blogPosts', (select count(*)::int from public.blog_posts),
  'blogTerms', (select count(*)::int from public.blog_terms),
  'blogPostTerms', (select count(*)::int from public.blog_post_terms),
  'blogPostGalleryItems', (select count(*)::int from public.blog_post_gallery_items),
  'blogPostRevisions', (select count(*)::int from public.blog_post_revisions),
  'cmsPages', (select count(*)::int from public.cms_pages),
  'storageObjects', (select count(*)::int from storage.objects),
  'cmsPageSlugs', (
    select coalesce(json_agg(slug order by slug), '[]'::json)
    from public.cms_pages
  ),
  'cmsPagesAreLivePublished', not exists (
    select 1 from public.cms_pages
    where deleted_at is not null
       or status <> 'published'
       or published_at is null
       or published_at > now()
  )
)::text;
`;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function fixtureEmailHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error('P1.12 SQL identity rejected');
  }
}

function assertFixturePost(row: FixturePost): void {
  const expected = new Map<string, readonly [string, string]>([
    [P112_FIXTURE.publishedPostId, [P112_FIXTURE.publishedPostSlug, 'published']],
    [P112_FIXTURE.unpublishedPostId, [P112_FIXTURE.unpublishedPostSlug, 'draft']],
  ]);
  const match = expected.get(row.id);
  if (!match || row.slug !== match[0] || row.status !== match[1] || row.noindex !== true) {
    throw new Error('P1.12 fixture content rejected');
  }
}

function fixtureRateLimitKeys(userId: string): string[] {
  return [
    'login:0.0.0.0',
    'login:127.0.0.1',
    `mfa-enroll:${userId}`,
    `mfa-verify:${userId}`,
    `mfa-recovery:${userId}`,
  ];
}

function fixtureFailedAttemptKeys(email: string): string[] {
  return [`acct:${email.toLowerCase()}`, 'net:0.0.0.0/24', 'net:127.0.0.0/24'];
}

export function createPostgresFixtureStore(run: CommandRunner): FixtureStore {
  const psql = (sql: string) =>
    run(
      'docker',
      [
        'exec',
        '--interactive',
        P112_TARGET.databaseContainer,
        'psql',
        '--username',
        'postgres',
        '--dbname',
        'postgres',
        '--set',
        'ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '--quiet',
      ],
      sql,
    );
  return {
    async readBaseline() {
      const output = (await psql(BASELINE_SQL)).trim();
      try {
        return JSON.parse(output) as unknown;
      } catch {
        throw new Error('P1.12 Postgres baseline unreadable');
      }
    },
    async findFixtureUserIdByEmail(email) {
      if (!/^p112-[a-zA-Z0-9_-]+@example\.invalid$/u.test(email)) {
        throw new Error('P1.12 fixture email rejected');
      }
      const output = (
        await psql(
          `select coalesce(json_agg(id order by id), '[]'::json)::text from auth.users where lower(email) = lower(${sqlLiteral(email)});`,
        )
      ).trim();
      let ids: unknown;
      try {
        ids = JSON.parse(output);
      } catch {
        throw new Error('P1.12 Auth identity recovery unreadable');
      }
      if (!Array.isArray(ids) || ids.length > 1 || ids.some((id) => typeof id !== 'string')) {
        throw new Error('P1.12 Auth identity recovery ambiguous');
      }
      if (ids.length === 0) return null;
      assertUuid(ids[0]);
      return ids[0];
    },
    async readFixtureState(userId, email) {
      assertUuid(userId);
      if (!/^p112-[a-zA-Z0-9_-]+@example\.invalid$/u.test(email)) {
        throw new Error('P1.12 fixture email rejected');
      }
      const id = `${sqlLiteral(userId)}::uuid`;
      const emailHash = sqlLiteral(fixtureEmailHash(email));
      const failedAttemptKeys = fixtureFailedAttemptKeys(email).map(sqlLiteral);
      const rateKeys = fixtureRateLimitKeys(userId).map(sqlLiteral);
      const output = (
        await psql(`select json_build_object(
          'profile', (select json_build_object('id', id, 'role', role, 'status', status, 'fullName', full_name, 'mfaEnrolledAt', mfa_enrolled_at) from public.profiles where id = ${id}),
          'posts', (select coalesce(json_agg(json_build_object('id', id, 'slug', slug, 'status', status, 'noindex', noindex, 'title', title, 'contentHtml', content_html) order by id), '[]'::json) from public.blog_posts where id in (${sqlLiteral(P112_FIXTURE.publishedPostId)}::uuid, ${sqlLiteral(P112_FIXTURE.unpublishedPostId)}::uuid)),
          'blogMedia', (select count(*)::int from public.blog_media),
          'blogTerms', (select count(*)::int from public.blog_terms),
          'blogPostTerms', (select count(*)::int from public.blog_post_terms),
          'blogPostGalleryItems', (select count(*)::int from public.blog_post_gallery_items),
          'blogPostRevisions', (select count(*)::int from public.blog_post_revisions),
          'recoveryCodes', (select count(*)::int from public.user_mfa_recovery_codes where user_id = ${id}),
          'rateLimitKeys', (select coalesce(json_agg(key order by key), '[]'::json) from public.rate_limits where key in (${rateKeys.join(', ')})),
          'authEventsTotal', (select count(*)::int from public.auth_events),
          'unownedAuthEvents', (select count(*)::int from public.auth_events where not (
            (actor_user_id = ${id} and kind in ('login_success', 'login_failure', 'logout', 'mfa_enrolled', 'mfa_challenge_success', 'mfa_challenge_failure', 'mfa_reset', 'session_revoked'))
            or (actor_user_id is null and kind = 'login_failure' and details->>'email_hash' = ${emailHash})
          )),
          'authFailedAttemptsTotal', (select count(*)::int from public.auth_failed_attempts),
          'authFailedAttemptKeys', (select coalesce(json_agg(key order by key), '[]'::json) from public.auth_failed_attempts where key in (${failedAttemptKeys.join(', ')}))
        )::text;`)
      ).trim();
      try {
        return JSON.parse(output) as unknown;
      } catch {
        throw new Error('P1.12 fixture ownership state unreadable');
      }
    },
    async deleteFixtureContent(ids) {
      if (
        ids.length !== 2 ||
        ids[0] !== P112_FIXTURE.publishedPostId ||
        ids[1] !== P112_FIXTURE.unpublishedPostId
      ) {
        throw new Error('P1.12 content cleanup scope rejected');
      }
      await psql(`delete from public.blog_posts where (id, slug) in (
        (${sqlLiteral(P112_FIXTURE.publishedPostId)}::uuid, ${sqlLiteral(P112_FIXTURE.publishedPostSlug)}),
        (${sqlLiteral(P112_FIXTURE.unpublishedPostId)}::uuid, ${sqlLiteral(P112_FIXTURE.unpublishedPostSlug)})
      );`);
    },
    async deleteFixtureUserRows(userId, email) {
      assertUuid(userId);
      if (!/^p112-[a-zA-Z0-9_-]+@example\.invalid$/u.test(email)) {
        throw new Error('P1.12 fixture email rejected');
      }
      const id = `${sqlLiteral(userId)}::uuid`;
      const emailHash = sqlLiteral(fixtureEmailHash(email));
      const failedAttemptKeys = fixtureFailedAttemptKeys(email).map(sqlLiteral);
      const rateKeys = fixtureRateLimitKeys(userId).map(sqlLiteral);
      await psql(`begin;
        delete from public.user_mfa_recovery_codes where user_id = ${id};
        delete from public.auth_events where
          (actor_user_id = ${id} and kind in ('login_success', 'login_failure', 'logout', 'mfa_enrolled', 'mfa_challenge_success', 'mfa_challenge_failure', 'mfa_reset', 'session_revoked'))
          or (actor_user_id is null and kind = 'login_failure' and details->>'email_hash' = ${emailHash});
        delete from public.auth_failed_attempts where key in (${failedAttemptKeys.join(', ')});
        delete from public.rate_limits where key in (${rateKeys.join(', ')});
        delete from public.profiles where id = ${id};
      commit;`);
    },
    async insertFixtureContent(rows) {
      for (const row of rows) assertFixturePost(row);
      if (new Set(rows.map((row) => row.id)).size !== rows.length) {
        throw new Error('P1.12 duplicate fixture content rejected');
      }
      if (rows.length === 0) return;
      const values = rows.map(
        (row) =>
          `(${sqlLiteral(row.id)}::uuid, ${sqlLiteral(row.slug)}, ${sqlLiteral(row.title)}, ${sqlLiteral(row.excerpt)}, ${sqlLiteral(JSON.stringify(row.contentJson))}::jsonb, ${sqlLiteral(row.contentHtml)}, ${sqlLiteral(row.status)}, ${row.publishedAt ? `${sqlLiteral(row.publishedAt)}::timestamptz` : 'null'}, ${row.noindex ? 'true' : 'false'})`,
      );
      await psql(`insert into public.blog_posts
        (id, slug, title, excerpt, content_json, content_html, status, published_at, noindex)
        values ${values.join(',\n')};`);
    },
    async insertProfile(input) {
      assertUuid(input.id);
      if (input.role !== 'super_admin' || input.status !== 'active') {
        throw new Error('P1.12 profile scope rejected');
      }
      await psql(`insert into public.profiles (id, role, status, full_name)
        values (${sqlLiteral(input.id)}::uuid, 'super_admin', 'active', 'P1.12 synthetic acceptance user');`);
    },
  };
}

type AuthAdminClient = {
  auth: {
    admin: {
      createUser(input: {
        email: string;
        password: string;
        email_confirm: boolean;
        user_metadata: Record<string, unknown>;
        app_metadata: Record<string, unknown>;
      }): Promise<{
        data: { user: { id?: string } | null };
        error: unknown | null;
      }>;
      deleteUser(userId: string): Promise<{ error: unknown | null }>;
      getUserById(userId: string): Promise<{
        data: {
          user: {
            id?: string;
            email?: string;
            email_confirmed_at?: string | null;
            app_metadata?: Record<string, unknown>;
            user_metadata?: Record<string, unknown>;
            factors?: Array<{ factor_type?: unknown; status?: unknown }>;
          } | null;
        };
        error: unknown | null;
      }>;
    };
  };
};

export function createAuthFixture(client: AuthAdminClient): FixtureAuth {
  return {
    async createUser(input) {
      const { data, error } = await client.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: 'P1.12 synthetic acceptance user' },
        app_metadata: input.appMetadata,
      });
      if (error || !data.user?.id) throw new Error('P1.12 Auth identity creation failed');
      assertUuid(data.user.id);
      return data.user.id;
    },
    async deleteUser(userId) {
      assertUuid(userId);
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw new Error('P1.12 Auth identity deletion failed');
    },
    async readUser(userId) {
      assertUuid(userId);
      const { data, error } = await client.auth.admin.getUserById(userId);
      const user = data.user;
      if (error || !user?.id || !user.email) {
        throw new Error('P1.12 Auth identity read failed');
      }
      assertUuid(user.id);
      return {
        id: user.id,
        email: user.email,
        emailConfirmed: Boolean(user.email_confirmed_at),
        appMetadata: {
          mandoob_role: user.app_metadata?.mandoob_role,
          mandoob_status: user.app_metadata?.mandoob_status,
        },
        userMetadata: { full_name: user.user_metadata?.full_name },
        factors: (user.factors ?? []).map((factor) => ({
          factorType: typeof factor.factor_type === 'string' ? factor.factor_type : '',
          status: typeof factor.status === 'string' ? factor.status : '',
        })),
      };
    },
  };
}
