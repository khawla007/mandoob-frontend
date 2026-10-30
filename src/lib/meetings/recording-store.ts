import 'server-only';

import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/errors';
import type { Meeting } from '@/lib/data/meetings';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type StoredRecording = {
  recordingId: string;
  storagePath: string;
  mimeType: 'video/mp4';
  sizeBytes: number;
  sha256: string;
  scanProvider: string;
};

export async function attachMeetingRecordingVersion(
  meeting: Meeting,
  recording: StoredRecording,
): Promise<void> {
  if (!meeting.companyId)
    throw new ApiError('MEETING_UNAVAILABLE', 'Meeting is not available.', 404);
  const admin = createSupabaseServiceRoleClient();
  const { error: versionError } = await admin.from('meeting_recording_versions').insert({
    meeting_id: meeting.id,
    tenant_id: meeting.tenantId,
    company_id: meeting.companyId,
    provider_recording_id_hash: createHash('sha256').update(recording.recordingId).digest('hex'),
    storage_path: recording.storagePath,
    mime_type: recording.mimeType,
    size_bytes: recording.sizeBytes,
    sha256: recording.sha256,
    scan_provider: recording.scanProvider,
    scan_completed_at: new Date().toISOString(),
  });
  if (versionError && versionError.code !== '23505') {
    throw new ApiError('RECORDING_ATTACH_FAILED', 'Recording could not be attached.', 500);
  }
  const { error } = await admin
    .from('meetings')
    .update({
      status: 'recording_ready',
      recording_storage_path: recording.storagePath,
      recording_url: null,
      recording_ready_at: new Date().toISOString(),
    })
    .eq('id', meeting.id)
    .eq('tenant_id', meeting.tenantId)
    .eq('company_id', meeting.companyId);
  if (error) throw new ApiError('RECORDING_ATTACH_FAILED', 'Recording could not be attached.', 500);
}
