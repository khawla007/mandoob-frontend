import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PRO_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_AT = '2026-08-21T10:00:00.000Z';

test('timeline validates cursor and calls the bounded merged RPC exactly once', async () => {
  const calls: unknown[] = [];
  const cursor = Buffer.from(JSON.stringify({ eventAt: EVENT_AT, eventId: EVENT_ID })).toString(
    'base64url',
  );
  const { readProLifecycleTimeline } = await import('./pro-lifecycle-timeline');
  const result = await readProLifecycleTimeline(ACTOR_ID, PRO_ID, 25, cursor, {
    supabase: {
      async rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return {
          data: {
            items: [
              {
                eventAt: '2026-08-20T09:00:00.000Z',
                eventId: '44444444-4444-4444-8444-444444444444',
                eventKind: 'credential_verified',
                summaryCode: 'VERIFIED',
                actorDisplayName: 'Operator',
                companyDisplayName: null,
              },
            ],
          },
          error: null,
        };
      },
    } as never,
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.nextCursor, null);
  assert.deepEqual(calls, [
    {
      name: 'read_pro_lifecycle_timeline',
      args: {
        p_actor_id: ACTOR_ID,
        p_pro_profile_id: PRO_ID,
        p_limit: 25,
        p_cursor_event_at: EVENT_AT,
        p_cursor_event_id: EVENT_ID,
      },
    },
  ]);
});

test('timeline rejects malformed cursors, oversized pages, and unsafe output before disclosure', async () => {
  const { readProLifecycleTimeline } = await import('./pro-lifecycle-timeline');
  await assert.rejects(() => readProLifecycleTimeline(ACTOR_ID, PRO_ID, 101, null), /limit/u);
  await assert.rejects(
    () => readProLifecycleTimeline(ACTOR_ID, PRO_ID, 25, 'bad+cursor'),
    /cursor/u,
  );
  await assert.rejects(
    () =>
      readProLifecycleTimeline(ACTOR_ID, PRO_ID, 25, null, {
        supabase: {
          async rpc() {
            return { data: { items: [{ storagePath: 'private' }] }, error: null };
          },
        } as never,
      }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'INTERNAL',
  );
});

test('cursor timeline preserves uniform not-found for unknown and inaccessible PROs', async () => {
  const cursor = Buffer.from(JSON.stringify({ eventAt: EVENT_AT, eventId: EVENT_ID })).toString(
    'base64url',
  );
  const { readProLifecycleTimeline } = await import('./pro-lifecycle-timeline');

  for (const message of ['NOT_FOUND', 'FORBIDDEN']) {
    await assert.rejects(
      () =>
        readProLifecycleTimeline(ACTOR_ID, PRO_ID, 25, cursor, {
          supabase: {
            async rpc() {
              return { data: null, error: { message } };
            },
          } as never,
        }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'NOT_FOUND' &&
        error.message === 'PRO not found',
    );
  }
});
