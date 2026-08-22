import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PRO_ID = '22222222-2222-4222-8222-222222222222';

test('direct PRO detail loader makes one aggregate authorized read and exposes safe lifecycle data', async () => {
  const calls: unknown[] = [];
  const { readProLifecycleDetail } = await import('@/lib/data/pro-lifecycle-detail');
  const snapshot = await readProLifecycleDetail(ACTOR_ID, PRO_ID, {
    supabase: {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return {
          data: {
            profile: {
              id: PRO_ID,
              fullName: 'Fatima Noor',
              email: 'fatima@example.com',
              emailUnavailable: false,
              accountStatus: 'active',
              designation: 'Consultant',
              department: null,
              serviceAreas: ['DUBAI'],
              bio: null,
              createdAt: '2026-08-01T10:00:00.000Z',
            },
            credentials: [],
            evidence: [],
            eligibility: {
              eligible: false,
              codes: ['PRO_CREDENTIAL_MISSING'],
              verifiedCredentialId: null,
              pricingTermId: null,
              compensationTermId: null,
            },
            assignment: null,
            commercialTerms: [],
            timeline: { items: [], nextCursor: null },
          },
          error: null,
        };
      },
    } as never,
  });
  assert.equal(snapshot.profile.id, PRO_ID);
  assert.deepEqual(calls, [
    {
      name: 'read_pro_lifecycle_detail',
      args: { p_actor_id: ACTOR_ID, p_pro_profile_id: PRO_ID, p_timeline_limit: 25 },
    },
  ]);
  assert.doesNotMatch(JSON.stringify(snapshot), /storagePath|identifierCiphertext|identifierHash/u);
});

test('direct detail maps unknown, non-PRO, and inaccessible RPC results to one not-found code', async () => {
  const { readProLifecycleDetail } = await import('@/lib/data/pro-lifecycle-detail');
  for (const message of ['NOT_FOUND', 'FORBIDDEN']) {
    await assert.rejects(
      () =>
        readProLifecycleDetail(ACTOR_ID, PRO_ID, {
          supabase: {
            async rpc() {
              return { data: null, error: { message } };
            },
          } as never,
        }),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'NOT_FOUND',
    );
  }
});

test('detail page authorizes before validating and loading one aggregate snapshot', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/admin/users/[id]/page.tsx'), 'utf8');
  const auth = source.indexOf('requirePlatformOperator()');
  const validation = source.indexOf('isUuid(id)');
  const load = source.indexOf('readProLifecycleDetail(operator.id, id)');
  assert.ok(auth >= 0 && validation > auth && load > validation);
  assert.match(source, /if \(!isUuid\(id\)\) notFound\(\)/u);
  assert.match(source, /catch[\s\S]*notFound\(\)/u);
  assert.doesNotMatch(source, /getUserForEdit|auth\.admin|getUserById/u);
});

test('detail page preserves internal failures for the localized route error boundary', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/admin/users/[id]/page.tsx'), 'utf8');
  const boundary = readFileSync(join(process.cwd(), 'src/app/admin/users/error.tsx'), 'utf8');
  assert.match(page, /error instanceof ApiError && error\.code === 'NOT_FOUND'/u);
  assert.match(page, /throw error/u);
  assert.match(boundary, /useTranslations\('admin\.user\.proRegistry'\)/u);
  assert.match(boundary, /reset\(\)/u);
});
