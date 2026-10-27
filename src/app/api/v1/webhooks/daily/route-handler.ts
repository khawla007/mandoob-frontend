import { errorResponse, jsonOk } from '@/lib/errors';
import { createHash } from 'node:crypto';
import {
  dailyRecordingStoragePath,
  findMeetingByDailyRoom,
  type Meeting,
} from '@/lib/data/meetings';
import { ensurePendingMeetingAiSummary } from '@/lib/data/meeting-ai-summaries';
import { attachMeetingRecordingVersion } from '@/lib/meetings/recording-store';
import { downloadDailyRecording, verifyDailyWebhook } from '@/lib/meetings/daily';
import type { DailyWebhookEvent } from '@/lib/meetings/daily';
import { ingestDailyRecording } from '@/lib/meetings/recording-ingestion';
import { scanFilePrivate } from '@/lib/security/scan-file';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type DailyWebhookDependencies = {
  verify(request: Request): Promise<DailyWebhookEvent | null>;
  reserve(event: DailyWebhookEvent): Promise<boolean>;
  findMeeting(roomName: string): Promise<Meeting | null>;
  ingestRecording(meeting: Meeting, recordingId: string, storagePath: string): Promise<void>;
  ensureSummary(meetingId: string): Promise<unknown>;
};

const dailyWebhookDependencies: DailyWebhookDependencies = {
  verify: verifyDailyWebhook,
  async reserve(event) {
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin.from('meeting_provider_callback_receipts').insert({
      provider: 'daily',
      destination_id: null,
      provider_event_id_hash: createHash('sha256').update(event.id).digest('hex'),
      payload_hash: createHash('sha256').update(JSON.stringify(event.payload)).digest('hex'),
      occurred_at: event.timestamp,
      state: 'reserved',
    });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw error;
  },
  findMeeting: findMeetingByDailyRoom,
  async ingestRecording(meeting, recordingId, storagePath) {
    const recording = await downloadDailyRecording(recordingId);
    const admin = createSupabaseServiceRoleClient();
    await ingestDailyRecording(
      { recordingId, downloadUrl: recording.downloadUrl, storagePath },
      {
        fetchImpl: fetch,
        async scan(bytes) {
          const result = await scanFilePrivate(bytes, { filename: 'recording.mp4' });
          return { clean: result.clean, provider: result.provider ?? 'clamav' };
        },
        async upload(path, bytes, metadata) {
          const { error } = await admin.storage.from('tenant-meetings').upload(path, bytes, {
            contentType: metadata.mimeType,
            upsert: false,
            metadata: { sha256: metadata.sha256 },
          });
          if (error) throw error;
        },
        attach: (metadata) => attachMeetingRecordingVersion(meeting, metadata),
        async remove(path) {
          await admin.storage.from('tenant-meetings').remove([path]);
        },
      },
    );
  },
  ensureSummary: ensurePendingMeetingAiSummary,
};

export async function handleDailyWebhook(
  request: Request,
  dependencies: DailyWebhookDependencies = dailyWebhookDependencies,
): Promise<Response> {
  const event = await dependencies.verify(request);
  if (!event) return errorResponse('INVALID_SIGNATURE', 'Invalid Daily webhook signature', 401);
  if (event.type !== 'recording.ready') return jsonOk({ ignored: true });
  if (!(await dependencies.reserve(event))) return jsonOk({ ignored: true });

  const roomName = String(event.payload.room_name ?? event.payload.room ?? '');
  if (!roomName) return errorResponse('INVALID_PAYLOAD', 'Missing Daily room name', 400);

  const meeting = await dependencies.findMeeting(roomName);
  if (!meeting) return jsonOk({ ignored: true });

  const recordingId = String(event.payload.recording_id ?? event.payload.id ?? '');
  const storagePath =
    meeting.recordingStoragePath ??
    dailyRecordingStoragePath(
      { tenantId: meeting.tenantId, companyId: meeting.companyId, meetingId: meeting.id },
      recordingId,
    );

  await dependencies.ingestRecording(meeting, recordingId, storagePath);

  try {
    await dependencies.ensureSummary(meeting.id);
  } catch (error) {
    console.warn('meeting AI summary enqueue failed', {
      meetingId: meeting.id,
      code: error instanceof Error ? error.name : 'UNKNOWN',
    });
  }

  return jsonOk({ ok: true });
}
