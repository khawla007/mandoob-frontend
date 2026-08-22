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
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

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

test('realistic detail next cursor always decodes with the shared timeline decoder', async () => {
  const cursorPayload = { eventAt: '2026-08-21T10:00:00.000Z', eventId: EVENT_ID };
  const nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64url');
  const { readProLifecycleDetail } = await import('@/lib/data/pro-lifecycle-detail');
  const { decodeProTimelineCursor } = await import('@/lib/validation/pro-lifecycle');
  const snapshot = await readProLifecycleDetail(ACTOR_ID, PRO_ID, {
    supabase: {
      async rpc() {
        return {
          data: {
            profile: {
              id: PRO_ID,
              fullName: 'Fatima Noor',
              email: null,
              emailUnavailable: true,
              accountStatus: 'active',
              designation: null,
              department: null,
              serviceAreas: [],
              bio: null,
              createdAt: '2026-08-01T10:00:00.000Z',
            },
            credentials: [
              {
                credentialId: EVENT_ID,
                type: 'pro_license',
                maskedIdentifier: '•••• 1234',
                issuingAuthority: 'DET',
                issueDate: '2026-01-01',
                expiryDate: '2027-01-01',
                state: 'verified',
                version: 2,
                evidenceCount: 1,
                submittedAt: '2026-08-20T10:00:00.000Z',
                supersedesCredentialId: null,
              },
            ],
            evidence: [
              {
                evidenceId: ACTOR_ID,
                credentialId: EVENT_ID,
                mimeType: 'application/pdf',
                sizeBytes: 1200,
                originalNameSafe: 'licence.pdf',
                createdAt: '2026-08-20T10:00:00.000Z',
              },
            ],
            eligibility: {
              eligible: true,
              codes: [],
              verifiedCredentialId: EVENT_ID,
              pricingTermId: ACTOR_ID,
              compensationTermId: PRO_ID,
            },
            assignment: {
              assignmentId: ACTOR_ID,
              tenantId: PRO_ID,
              companyId: EVENT_ID,
              companyName: 'Acme',
              assignedAt: '2026-08-21T09:00:00.000Z',
            },
            commercialTerms: [
              {
                termId: ACTOR_ID,
                termKind: 'pricing',
                model: 'per_registration',
                currency: 'AED',
                amountMinor: 10000,
                retainerInterval: null,
                scope: 'all_registrations',
                effectiveFrom: '2026-08-01',
                effectiveTo: null,
                status: 'active',
                version: 1,
              },
            ],
            timeline: {
              items: [
                {
                  eventAt: cursorPayload.eventAt,
                  eventId: EVENT_ID,
                  eventKind: 'credential_verified',
                  summaryCode: 'VERIFIED',
                  actorDisplayName: 'Operator',
                  companyDisplayName: null,
                },
              ],
              nextCursor,
            },
          },
          error: null,
        };
      },
    } as never,
  });
  assert.deepEqual(decodeProTimelineCursor(snapshot.timeline.nextCursor!), cursorPayload);
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260822140000_0075_pro_registry_setwise.sql'),
    'utf8',
  );
  assert.match(sql, /pg_catalog\.replace[\s\S]*pg_catalog\.chr\(10\)[\s\S]*pg_catalog\.chr\(13\)/u);
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

test('detail page reuses aggregate first history page and only calls cursor reader for older pages', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/admin/users/[id]/page.tsx'), 'utf8');
  assert.match(source, /timelineSelection\.cursor === null[\s\S]*snapshot\.timeline/u);
  assert.match(source, /readProLifecycleTimeline[\s\S]*timelineSelection\.cursor/u);
});
