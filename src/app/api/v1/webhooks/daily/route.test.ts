import assert from 'node:assert/strict';
import test from 'node:test';

test('Daily recording webhook carries tenant and company ownership into attachment storage', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder-anon-key-000000000000';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'placeholder-service-key-000000000';
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'example.com';
  const { handleDailyWebhook } = await import('./route-handler');
  const ingestions: Array<{ meetingId: string; storagePath: string; recordingId: string }> = [];
  const response = await handleDailyWebhook(new Request('https://mandoob.test/webhook'), {
    verify: async () => ({
      id: 'daily-event-1',
      timestamp: '2026-10-27T06:00:00.000Z',
      type: 'recording.ready',
      payload: { room_name: 'room-1', recording_id: 'recording-1' },
    }),
    findMeeting: async () => ({
      id: 'meeting-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      leadId: null,
      customerProfileId: null,
      title: 'Consultation',
      status: 'scheduled',
      scheduledAt: '2026-08-18T09:00:00.000Z',
      durationMinutes: 30,
      timezone: 'Asia/Dubai',
      providerRoomName: 'room-1',
      meetingUrl: null,
      recordingStoragePath: null,
      recordingUrl: null,
      recordingReadyAt: null,
      version: 1,
    }),
    reserve: async () => true,
    ingestRecording: async (meeting, recordingId, storagePath) => {
      ingestions.push({ meetingId: meeting.id, storagePath, recordingId });
    },
    ensureSummary: async () => undefined,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(ingestions, [
    {
      meetingId: 'meeting-1',
      storagePath: 'tenant-1/company-1/meetings/meeting-1/recording-1.mp4',
      recordingId: 'recording-1',
    },
  ]);
});

test('Daily webhook replay and unknown rooms are non-disclosing noops', async () => {
  const { handleDailyWebhook } = await import('./route-handler');
  const event = {
    id: 'daily-event-2',
    timestamp: '2026-10-27T06:00:00.000Z',
    type: 'recording.ready',
    payload: { room_name: 'unknown', recording_id: 'recording-2' },
  };
  const replay = await handleDailyWebhook(new Request('https://mandoob.test/webhook'), {
    verify: async () => event,
    reserve: async () => false,
    findMeeting: async () => null,
    ingestRecording: async () => assert.fail('replay must not ingest'),
    ensureSummary: async () => undefined,
  });
  assert.equal(replay.status, 200);
});
