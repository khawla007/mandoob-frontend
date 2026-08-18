import { errorResponse, jsonOk } from '@/lib/errors';
import {
  attachMeetingRecording,
  dailyRecordingStoragePath,
  findMeetingByDailyRoom,
  type Meeting,
} from '@/lib/data/meetings';
import { ensurePendingMeetingAiSummary } from '@/lib/data/meeting-ai-summaries';
import { verifyDailyWebhook } from '@/lib/meetings/daily';
import type { DailyWebhookEvent } from '@/lib/meetings/daily';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DailyWebhookDependencies = {
  verify(request: Request): Promise<DailyWebhookEvent | null>;
  findMeeting(roomName: string): Promise<Meeting | null>;
  attachRecording(
    meetingId: string,
    recording: { storagePath: string; recordingUrl?: string | null },
  ): Promise<void>;
  ensureSummary(meetingId: string): Promise<unknown>;
};

const dailyWebhookDependencies: DailyWebhookDependencies = {
  verify: verifyDailyWebhook,
  findMeeting: findMeetingByDailyRoom,
  attachRecording: attachMeetingRecording,
  ensureSummary: ensurePendingMeetingAiSummary,
};

export async function handleDailyWebhook(
  request: Request,
  dependencies: DailyWebhookDependencies = dailyWebhookDependencies,
): Promise<Response> {
  const event = await dependencies.verify(request);
  if (!event) return errorResponse('INVALID_SIGNATURE', 'Invalid Daily webhook signature', 401);
  if (event.type !== 'recording.ready') return jsonOk({ ignored: true });

  const roomName = String(event.payload.room_name ?? event.payload.room ?? '');
  if (!roomName) return errorResponse('INVALID_PAYLOAD', 'Missing Daily room name', 400);

  const meeting = await dependencies.findMeeting(roomName);
  if (!meeting) return errorResponse('NOT_FOUND', 'Meeting not found', 404);

  const recordingId = String(event.payload.recording_id ?? event.payload.id ?? '');
  const storagePath =
    meeting.recordingStoragePath ??
    dailyRecordingStoragePath(
      { tenantId: meeting.tenantId, companyId: meeting.companyId, meetingId: meeting.id },
      recordingId,
    );

  await dependencies.attachRecording(meeting.id, {
    storagePath,
    recordingUrl: null,
  });

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

export async function POST(request: Request): Promise<Response> {
  return handleDailyWebhook(request);
}
