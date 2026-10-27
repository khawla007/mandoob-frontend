import { redactMeetingTranscript } from './privacy';

export type MeetingAiClaim = {
  eventJobId: string;
  leaseToken: string;
  meetingId: string;
  attempt: number;
  maxAttempts: number;
};

export type MeetingAiProcessResult = {
  transcriptText: string;
  effectHash: string;
  payload?: unknown;
};

export type MeetingAiWorkerDeps = {
  workerId: string;
  claim(): Promise<MeetingAiClaim[]>;
  hasConsent(claim: MeetingAiClaim): Promise<boolean>;
  process(claim: MeetingAiClaim): Promise<MeetingAiProcessResult>;
  persist(
    claim: MeetingAiClaim,
    redactedTranscript: string,
    result: MeetingAiProcessResult,
  ): Promise<void>;
  complete(claim: MeetingAiClaim, effectHash: string): Promise<void>;
  fail(claim: MeetingAiClaim, retryable: boolean): Promise<void>;
  cancel(claim: MeetingAiClaim, code: string): Promise<void>;
  log(event: string): void;
};

export type MeetingAiWorkerSummary = {
  processed: number;
  completed: number;
  retried: number;
  cancelled: number;
  lost: number;
};

function isLeaseLoss(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown } | null;
  return value?.code === 'LEASE_LOST' || value?.message === 'STALE_EVENT_JOB_LEASE';
}

export async function runMeetingAiWorkerOnce(
  deps: MeetingAiWorkerDeps,
): Promise<MeetingAiWorkerSummary> {
  const summary: MeetingAiWorkerSummary = {
    processed: 0,
    completed: 0,
    retried: 0,
    cancelled: 0,
    lost: 0,
  };
  for (const claim of await deps.claim()) {
    summary.processed++;
    try {
      if (!(await deps.hasConsent(claim))) {
        await deps.cancel(claim, 'CONSENT_REQUIRED');
        summary.cancelled++;
        continue;
      }
      const result = await deps.process(claim);
      await deps.persist(claim, redactMeetingTranscript(result.transcriptText), result);
      await deps.complete(claim, result.effectHash);
      summary.completed++;
    } catch (error) {
      if (isLeaseLoss(error)) {
        deps.log('meeting-ai.lease-lost');
        summary.lost++;
        continue;
      }
      deps.log('meeting-ai.retryable-failure');
      summary.retried++;
      try {
        await deps.fail(claim, claim.attempt < claim.maxAttempts);
      } catch {
        deps.log('meeting-ai.fail-report-failed');
      }
    }
  }
  return summary;
}
