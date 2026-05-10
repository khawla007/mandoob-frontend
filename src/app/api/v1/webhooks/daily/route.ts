import { errorResponse, jsonOk } from '@/lib/errors';
import { attachMeetingRecording, findMeetingByDailyRoom } from '@/lib/data/meetings';
import { ensurePendingMeetingAiSummary } from '@/lib/data/meeting-ai-summaries';
import { verifyDailyWebhook } from '@/lib/meetings/daily';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const event = await verifyDailyWebhook(request);
  if (!event) return errorResponse('INVALID_SIGNATURE', 'Invalid Daily webhook signature', 401);
  if (event.type !== 'recording.ready') return jsonOk({ ignored: true });

  const roomName = String(event.payload.room_name ?? event.payload.room ?? '');
  if (!roomName) return errorResponse('INVALID_PAYLOAD', 'Missing Daily room name', 400);

  const meeting = await findMeetingByDailyRoom(roomName);
  if (!meeting) return errorResponse('NOT_FOUND', 'Meeting not found', 404);

  const recordingId = String(event.payload.recording_id ?? event.payload.id ?? '');
  const storagePath =
    meeting.recordingStoragePath ??
    `${meeting.tenantId}/meetings/${meeting.id}/${recordingId || 'recording'}.mp4`;

  await attachMeetingRecording(meeting.id, {
    storagePath,
    recordingUrl: null,
  });

  try {
    await ensurePendingMeetingAiSummary(meeting.id);
  } catch (error) {
    console.warn('meeting AI summary enqueue failed', {
      meetingId: meeting.id,
      code: error instanceof Error ? error.name : 'UNKNOWN',
    });
  }

  return jsonOk({ ok: true });
}
