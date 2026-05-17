import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';

async function loadDaily() {
  return import('./daily');
}

test('createDailyRoom fails with typed configuration error when API key is missing', async () => {
  const previous = process.env.DAILY_API_KEY;
  delete process.env.DAILY_API_KEY;
  const { createDailyRoom } = await loadDaily();

  await assert.rejects(
    () =>
      createDailyRoom({
        meetingId: 'meeting-1',
        startsAt: '2026-05-10T08:00:00.000Z',
        durationMinutes: 30,
        fetchImpl: async () => new Response('{}'),
      }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'DAILY_NOT_CONFIGURED' &&
      'status' in error &&
      error.status === 503,
  );

  process.env.DAILY_API_KEY = previous;
});

test('createDailyRoom posts a room with deterministic name and recording enabled', async () => {
  process.env.DAILY_API_KEY = 'daily_test_key';
  const { createDailyRoom } = await loadDaily();
  const calls: Array<{ url: string; init: RequestInit }> = [];

  const room = await createDailyRoom({
    meetingId: 'meeting-1',
    startsAt: '2026-05-10T08:00:00.000Z',
    durationMinutes: 45,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({ name: 'mandoob-meeting-1', url: 'https://example.daily.co/mandoob-meeting-1' });
    },
  });

  assert.equal(room.name, 'mandoob-meeting-1');
  assert.equal(room.url, 'https://example.daily.co/mandoob-meeting-1');
  assert.equal(calls[0].url, 'https://api.daily.co/v1/rooms');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer daily_test_key');

  const payload = JSON.parse(String(calls[0].init.body));
  assert.equal(payload.name, 'mandoob-meeting-1');
  assert.equal(payload.properties.enable_recording, 'cloud');
  assert.equal(payload.properties.start_audio_off, true);
});

test('verifyDailyWebhook fails closed on missing or invalid signature', async () => {
  process.env.DAILY_WEBHOOK_SECRET = 'daily_webhook_secret';
  const { verifyDailyWebhook } = await loadDaily();
  const body = JSON.stringify({ type: 'recording.ready', payload: { room_name: 'mandoob-meeting-1' } });

  assert.equal(await verifyDailyWebhook(new Request('https://example.test', { method: 'POST', body })), null);
  assert.equal(
    await verifyDailyWebhook(
      new Request('https://example.test', {
        method: 'POST',
        body,
        headers: { 'x-daily-signature': 'bad' },
      }),
    ),
    null,
  );
});

test('verifyDailyWebhook returns parsed event for valid signature', async () => {
  process.env.DAILY_WEBHOOK_SECRET = 'daily_webhook_secret';
  const { verifyDailyWebhook } = await loadDaily();
  const body = JSON.stringify({
    type: 'recording.ready',
    payload: { room_name: 'mandoob-meeting-1', recording_id: 'rec-1' },
  });
  const signature = createHmac('sha256', process.env.DAILY_WEBHOOK_SECRET).update(body).digest('hex');

  const event = await verifyDailyWebhook(
    new Request('https://example.test', {
      method: 'POST',
      body,
      headers: { 'x-daily-signature': signature },
    }),
  );

  assert.equal(event?.type, 'recording.ready');
  assert.equal(event?.payload.recording_id, 'rec-1');
});
