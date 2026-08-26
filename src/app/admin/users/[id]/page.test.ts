import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import type { ProLifecycleIdentity } from '@/lib/data/pro-lifecycle-identity';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PRO_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

const identityFixture: ProLifecycleIdentity = {
  profile: {
    id: PRO_ID,
    fullName: 'Fatima Noor',
    email: 'fatima@example.com',
    emailUnavailable: false,
    accountStatus: 'active' as const,
    designation: 'Consultant',
    department: null,
    serviceAreas: ['DUBAI'],
    bio: null,
    createdAt: '2026-08-01T10:00:00.000Z',
  },
  eligibility: {
    eligible: false,
    codes: ['PRO_CREDENTIAL_MISSING'],
    verifiedCredentialId: null,
    pricingTermId: null,
    compensationTermId: null,
  },
  assignment: null,
};

test('mandatory PRO identity loader reads one strict summary-only DTO', async () => {
  const calls: unknown[] = [];
  const { readProLifecycleIdentity } = await import('@/lib/data/pro-lifecycle-identity');
  const snapshot = await readProLifecycleIdentity(ACTOR_ID, PRO_ID, {
    supabase: {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return { data: identityFixture, error: null };
      },
    } as never,
  });
  assert.equal(snapshot.profile.id, PRO_ID);
  assert.deepEqual(calls, [
    {
      name: 'read_pro_lifecycle_identity',
      args: { p_actor_id: ACTOR_ID, p_pro_profile_id: PRO_ID },
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /credentials|evidence|commercialTerms|timeline|storagePath|identifierCiphertext|identifierHash/u,
  );
  await assert.rejects(
    () =>
      readProLifecycleIdentity(ACTOR_ID, PRO_ID, {
        supabase: {
          async rpc() {
            return { data: { ...identityFixture, credentials: [] }, error: null };
          },
        } as never,
      }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'INTERNAL',
  );
});

test('identity maps unknown, non-PRO, and inaccessible targets to one not-found code', async () => {
  const { readProLifecycleIdentity } = await import('@/lib/data/pro-lifecycle-identity');
  for (const message of ['NOT_FOUND', 'FORBIDDEN']) {
    await assert.rejects(
      () =>
        readProLifecycleIdentity(ACTOR_ID, PRO_ID, {
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

test('page orchestration stops on identity failure before optional reads', async () => {
  const { loadProLifecyclePage } = await import('./page-orchestration');
  const calls: string[] = [];
  const failure = new Error('private database detail');
  await assert.rejects(
    () =>
      loadProLifecyclePage(ACTOR_ID, PRO_ID, null, {
        identity: async () => {
          calls.push('identity');
          throw failure;
        },
        credential: async () => {
          calls.push('credential');
          return { credentials: [], evidence: [] };
        },
        terms: async () => {
          calls.push('terms');
          return [];
        },
        timeline: async () => {
          calls.push('timeline');
          return { items: [], nextCursor: null };
        },
      }),
    failure,
  );
  assert.deepEqual(calls, ['identity']);
});

test('page orchestration calls healthy optional loaders once after identity', async () => {
  const { loadProLifecyclePage } = await import('./page-orchestration');
  const calls: string[] = [];
  const result = await loadProLifecyclePage(ACTOR_ID, PRO_ID, 'validated-cursor', {
    identity: async () => {
      calls.push('identity');
      return identityFixture;
    },
    credential: async () => {
      calls.push('credential');
      return { credentials: [], evidence: [] };
    },
    terms: async () => {
      calls.push('terms');
      return [];
    },
    timeline: async (_actorId, _proId, limit, cursor) => {
      calls.push(`timeline:${limit}:${cursor}`);
      return { items: [], nextCursor: null };
    },
  });
  assert.deepEqual(calls, ['identity', 'credential', 'terms', 'timeline:25:validated-cursor']);
  assert.deepEqual(
    [result.credentialState.kind, result.termsState.kind, result.timelineState.kind],
    ['ready', 'ready', 'ready'],
  );
});

test('each optional loader rejection is isolated and sanitized', async () => {
  const { loadProLifecyclePage } = await import('./page-orchestration');
  for (const failed of ['credential', 'terms', 'timeline'] as const) {
    const calls = { credential: 0, terms: 0, timeline: 0 };
    const fail = (name: keyof typeof calls, value: unknown) => async () => {
      calls[name] += 1;
      if (name === failed) throw new Error(`raw ${name} storage failure`);
      return value;
    };
    const result = await loadProLifecyclePage(ACTOR_ID, PRO_ID, null, {
      identity: async () => identityFixture,
      credential: fail('credential', { credentials: [], evidence: [] }) as never,
      terms: fail('terms', []) as never,
      timeline: fail('timeline', { items: [], nextCursor: null }) as never,
    });
    assert.deepEqual(calls, { credential: 1, terms: 1, timeline: 1 });
    assert.equal(result[`${failed}State`].kind, 'error');
    for (const healthy of ['credential', 'terms', 'timeline'] as const) {
      if (healthy !== failed) assert.equal(result[`${healthy}State`].kind, 'ready');
    }
    assert.doesNotMatch(JSON.stringify(result), /raw|storage failure/u);
  }
});

test('0081 identity read is fixed-path, service-only, data-minimized, and target-unified', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260824130000_0081_pro_lifecycle_identity.sql'),
    'utf8',
  );
  assert.match(sql, /create function public\.read_pro_lifecycle_identity/u);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/u);
  assert.match(sql, /message = 'NOT_FOUND'/u);
  assert.match(sql, /join public\.pro_profiles/u);
  assert.match(sql, /evaluate_pro_assignment_eligibility/u);
  assert.match(sql, /revoke all[\s\S]*public, anon, authenticated/u);
  assert.match(sql, /grant execute[\s\S]*to service_role/u);
  assert.doesNotMatch(
    sql,
    /pro_credentials|pro_credential_evidence|pro_commercial_terms|timeline|identifier_ciphertext|storage_path/u,
  );
});

test('detail page authorizes before validating and loading the orchestrated snapshot', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/admin/users/[id]/page.tsx'), 'utf8');
  const auth = source.indexOf('requirePlatformOperator()');
  const validation = source.indexOf('isUuid(id)');
  const load = source.indexOf('loadProLifecyclePage(operator.id, id');
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

test('timeline read model accepts normalized safe reasons and rejects private reason material', async () => {
  const { readProLifecycleTimeline } = await import('@/lib/data/pro-lifecycle-timeline');
  const valid = await readProLifecycleTimeline(ACTOR_ID, PRO_ID, 25, null, {
    supabase: {
      async rpc() {
        return {
          data: {
            items: [
              {
                eventAt: '2026-08-21T10:00:00.000Z',
                eventId: EVENT_ID,
                eventKind: 'credential_rejected',
                summaryCode: 'REJECTED',
                reasonCode: 'DOCUMENT_UNCLEAR',
                reason: 'The uploaded document is not readable.',
                actorDisplayName: null,
                companyDisplayName: null,
              },
            ],
          },
          error: null,
        };
      },
    } as never,
  });
  assert.equal(valid.items[0]?.reasonCode, 'DOCUMENT_UNCLEAR');
  assert.equal(valid.items[0]?.reason, 'The uploaded document is not readable.');
  await assert.rejects(() =>
    readProLifecycleTimeline(ACTOR_ID, PRO_ID, 25, null, {
      supabase: {
        async rpc() {
          return {
            data: {
              items: [
                {
                  ...valid.items[0],
                  reason: 'pro-credentials/private/object.pdf',
                },
              ],
            },
            error: null,
          };
        },
      } as never,
    }),
  );
});

test('forward timeline read exposes only authorized normalized decision reasons', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260822150000_0076_pro_lifecycle_timeline_reasons.sql',
    ),
    'utf8',
  );
  assert.match(sql, /create or replace function public\.read_pro_lifecycle_timeline/u);
  assert.match(sql, /decision\.reason_code/u);
  assert.match(sql, /decision\.reason/u);
  assert.match(sql, /order by event_at desc, event_id desc/u);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/u);
  assert.match(
    sql,
    /revoke all on function public\.read_pro_lifecycle_timeline[\s\S]*authenticated/u,
  );
  assert.match(
    sql,
    /grant execute on function public\.read_pro_lifecycle_timeline[\s\S]*service_role/u,
  );
  assert.match(sql, /read_pro_lifecycle_detail_without_reasons_0076/u);
  assert.match(sql, /jsonb_set[\s\S]*\{timeline,items\}/u);
  assert.doesNotMatch(sql, /identifier_ciphertext|identifier_hash|storage_path|sha256/u);
});

test('detail orchestration loads credential, term, and timeline sources independently after identity', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/admin/users/[id]/page-orchestration.ts'),
    'utf8',
  );
  assert.match(source, /Promise\.allSettled\(/u);
  assert.equal((source.match(/deps\.credential\(/gu) ?? []).length, 1);
  assert.equal((source.match(/deps\.terms\(/gu) ?? []).length, 1);
  assert.equal((source.match(/deps\.timeline\(/gu) ?? []).length, 1);
});
