import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { ensurePendingMeetingAiSummary } from '@/lib/data/meeting-ai-summaries';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { createOpenAiMeetingSummaryProvider, type MeetingSummaryProvider } from './ai-summary';
import { runMeetingAiWorkerOnce, type MeetingAiClaim, type MeetingAiWorkerDeps } from './ai-worker';
import { transcriptRetentionDeadline } from './privacy';

const CONSUMER = 'p311.meeting_ai.processor';

type ClaimedRow = {
  job_id: string;
  lease_token: string;
  attempt_number: number;
  max_attempts: number;
  payload: { resource_id?: string };
};

type ProcessPayload = Awaited<ReturnType<MeetingSummaryProvider['processRecording']>> & {
  summaryId: string;
};

export function createSupabaseMeetingAiWorkerDeps(
  options: {
    workerId?: string;
    batchSize?: number;
    provider?: MeetingSummaryProvider;
    signal?: AbortSignal;
  } = {},
): MeetingAiWorkerDeps {
  const admin = createSupabaseServiceRoleClient({ signal: options.signal });
  const workerId = options.workerId ?? randomUUID();
  const provider = options.provider ?? createOpenAiMeetingSummaryProvider();
  const lease = (claim: MeetingAiClaim) => ({
    p_job_id: claim.eventJobId,
    p_worker_id: workerId,
    p_lease_token: claim.leaseToken,
  });
  return {
    workerId,
    async claim() {
      const { data, error } = await admin.rpc('claim_event_jobs', {
        p_worker_id: workerId,
        p_consumer_name: CONSUMER,
        p_batch_size: options.batchSize ?? 5,
        p_lease_seconds: 300,
      });
      if (error) throw error;
      return ((data as ClaimedRow[] | null) ?? [])
        .filter((row) => typeof row.payload?.resource_id === 'string')
        .map((row) => ({
          eventJobId: row.job_id,
          leaseToken: row.lease_token,
          meetingId: row.payload.resource_id as string,
          attempt: Number(row.attempt_number),
          maxAttempts: Number(row.max_attempts),
        }));
    },
    async hasConsent(claim) {
      const { data, error } = await admin.rpc('p311_has_processing_consent', {
        p_meeting_id: claim.meetingId,
      });
      if (error) throw error;
      return data === true;
    },
    async process(claim) {
      const summary = await ensurePendingMeetingAiSummary(claim.meetingId, { supabase: admin });
      const { data: meeting, error } = await admin
        .from('meetings')
        .select('recording_storage_path')
        .eq('id', claim.meetingId)
        .single();
      if (error || !meeting?.recording_storage_path) throw new Error('RECORDING_NOT_FOUND');
      const { data: signed, error: signError } = await admin.storage
        .from('tenant-meetings')
        .createSignedUrl(meeting.recording_storage_path, 300);
      if (signError || !signed) throw new Error('RECORDING_NOT_FOUND');
      const output = await provider.processRecording({ recordingUrl: signed.signedUrl });
      const payload: ProcessPayload = { ...output, summaryId: summary.id };
      return {
        transcriptText: output.transcriptText,
        effectHash: createHash('sha256').update(JSON.stringify(output)).digest('hex'),
        payload,
      };
    },
    async persist(claim, redactedTranscript, result) {
      const output = result.payload as ProcessPayload;
      const { error } = await admin.rpc('p311_complete_ai_processing', {
        ...lease(claim),
        p_meeting_id: claim.meetingId,
        p_transcript: redactedTranscript,
        p_summary: output.summaryText,
        p_decisions: output.decisions,
        p_actions: output.actionItems,
        p_risks: output.risksOrFollowups,
        p_language: output.language,
        p_provider: output.provider,
        p_model: output.model,
        p_retain_until: transcriptRetentionDeadline(),
        p_effect_hash: result.effectHash,
      });
      if (error) throw error;
    },
    async complete() {},
    async fail(claim, retryable) {
      const { error } = await admin.rpc('fail_event_job', {
        ...lease(claim),
        p_error_category: 'provider_unavailable',
        p_error_code: 'MEETING_AI_FAILED',
        p_retryable: retryable,
      });
      if (error) throw error;
    },
    async cancel(claim, code) {
      const { error } = await admin.rpc('cancel_event_job', {
        p_job_id: claim.eventJobId,
        p_error_code: code,
      });
      if (error) throw error;
    },
    log: (event) => console.error(event),
  };
}

export async function processMeetingAiJobs(batchSize = 5) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.rpc('p311_delete_expired_transcripts', { p_limit: 100 });
  if (error) throw error;
  return runMeetingAiWorkerOnce(createSupabaseMeetingAiWorkerDeps({ batchSize }));
}
