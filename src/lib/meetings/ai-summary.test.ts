import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

async function loadAiSummary() {
  return import('./ai-summary');
}

test('validateMeetingSummaryPayload rejects malformed provider output', async () => {
  const { validateMeetingSummaryPayload } = await loadAiSummary();

  assert.equal(validateMeetingSummaryPayload({ summary: '', action_items: 'nope' }).ok, false);
});

test('validateMeetingSummaryPayload normalizes strict structured output', async () => {
  const { validateMeetingSummaryPayload } = await loadAiSummary();

  const result = validateMeetingSummaryPayload({
    summary: 'Client wants a DMCC setup.',
    decisions: ['Use DMCC'],
    action_items: [
      {
        title: 'Send checklist',
        owner_label: 'PRO',
        due_date: null,
        priority: 'high',
        source_quote: 'send me the checklist',
      },
    ],
    risks_or_followups: ['Confirm activities'],
    language: 'en',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.summaryText, 'Client wants a DMCC setup.');
    assert.equal(result.output.actionItems[0].priority, 'high');
  }
});

test('createOpenAiMeetingSummaryProvider fails safely when unconfigured', async () => {
  const { createOpenAiMeetingSummaryProvider, MeetingAiProviderError } = await loadAiSummary();
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  await assert.rejects(
    () =>
      createOpenAiMeetingSummaryProvider().processRecording({
        recordingUrl: 'https://storage.test/recording.mp4',
      }),
    (error: unknown) => error instanceof MeetingAiProviderError && error.code === 'PROVIDER_NOT_CONFIGURED',
  );

  process.env.OPENAI_API_KEY = previous;
});

test('createOpenAiMeetingSummaryProvider rejects oversized recordings before upload', async () => {
  const { createOpenAiMeetingSummaryProvider, MeetingAiProviderError } = await loadAiSummary();
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test';

  await assert.rejects(
    () =>
      createOpenAiMeetingSummaryProvider({
        maxRecordingBytes: 3,
        fetchImpl: async () =>
          new Response(new Uint8Array([1, 2, 3, 4]), {
            headers: { 'content-type': 'video/mp4' },
          }),
      }).processRecording({ recordingUrl: 'https://storage.test/recording.mp4' }),
    (error: unknown) => error instanceof MeetingAiProviderError && error.code === 'RECORDING_TOO_LARGE',
  );

  process.env.OPENAI_API_KEY = previous;
});

test('processPendingMeetingAiSummaries completes provider output and marks safe failures', async () => {
  const { processPendingMeetingAiSummaries, MeetingAiProviderError } = await loadAiSummary();
  const completed: string[] = [];
  const failed: Array<{ id: string; code: string }> = [];
  const jobs = [
    { id: 'summary-1', recordingUrl: 'https://storage.test/one.mp4', recordingStoragePath: null },
    { id: 'summary-2', recordingUrl: null, recordingStoragePath: null },
  ];

  const result = await processPendingMeetingAiSummaries({
    batchSize: 5,
    listPending: async () => jobs as never,
    complete: async (id) => {
      completed.push(id);
    },
    fail: async (id, code) => {
      failed.push({ id, code });
    },
    provider: {
      async processRecording(input) {
        if (!input.recordingUrl) throw new MeetingAiProviderError('RECORDING_NOT_FOUND', 'Recording missing');
        return {
          transcriptText: 'Client asked about DMCC licensing.',
          summaryText: 'Client needs DMCC licensing support.',
          decisions: [],
          actionItems: [],
          risksOrFollowups: [],
          language: 'en',
          provider: 'test',
          model: 'test-model',
        };
      },
    },
  });

  assert.deepEqual(result, { processed: 2, completed: 1, failed: 1 });
  assert.deepEqual(completed, ['summary-1']);
  assert.deepEqual(failed, [{ id: 'summary-2', code: 'RECORDING_NOT_FOUND' }]);
});
