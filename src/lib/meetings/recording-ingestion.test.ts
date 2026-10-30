import assert from 'node:assert/strict';
import test from 'node:test';

import { ingestDailyRecording } from './recording-ingestion';

const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

test('recording ingestion uploads verified bytes before attaching immutable metadata', async () => {
  const calls: string[] = [];
  const result = await ingestDailyRecording(
    {
      recordingId: 'daily-recording-1',
      downloadUrl: 'https://example.invalid/recording',
      storagePath: 'tenant/company/meetings/meeting/recording.mp4',
    },
    {
      fetchImpl: async () =>
        new Response(MP4, { headers: { 'content-type': 'video/mp4', 'content-length': '12' } }),
      scan: async () => ({ clean: true, provider: 'clamav' }),
      upload: async (_path, bytes, metadata) => {
        calls.push(`upload:${bytes.byteLength}:${metadata.sha256.length}`);
      },
      attach: async (metadata) => {
        calls.push(`attach:${metadata.sizeBytes}:${metadata.mimeType}`);
      },
    },
  );
  assert.deepEqual(calls, ['upload:12:64', 'attach:12:video/mp4']);
  assert.equal(result.sizeBytes, 12);
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
});

test('recording ingestion rejects malformed, oversized, or scanner-blocked bytes before upload', async () => {
  let uploads = 0;
  const deps = {
    fetchImpl: async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'video/mp4' } }),
    scan: async () => ({ clean: true, provider: 'clamav' }),
    upload: async () => {
      uploads++;
    },
    attach: async () => undefined,
  };
  await assert.rejects(
    ingestDailyRecording(
      { recordingId: 'x', downloadUrl: 'https://example.invalid/x', storagePath: 'safe.mp4' },
      deps,
    ),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'RECORDING_MAGIC_INVALID',
  );
  assert.equal(uploads, 0);
});
