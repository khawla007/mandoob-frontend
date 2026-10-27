import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runMeetingAiWorkerOnce, type MeetingAiClaim } from './ai-worker';

const claim: MeetingAiClaim = {
  eventJobId: '11111111-1111-4111-8111-111111111111',
  leaseToken: '22222222-2222-4222-8222-222222222222',
  meetingId: '33333333-3333-4333-8333-333333333333',
  attempt: 1,
  maxAttempts: 5,
};

function dependencies(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      workerId: '44444444-4444-4444-8444-444444444444',
      claim: async () => [claim],
      hasConsent: async () => true,
      process: async () => ({ transcriptText: 'person@example.com', effectHash: 'a'.repeat(64) }),
      persist: async (_claim: MeetingAiClaim, transcriptText: string) => {
        assert.equal(transcriptText, '[EMAIL_REDACTED]');
        calls.push('persist');
      },
      complete: async () => {
        calls.push('complete');
      },
      fail: async () => {
        calls.push('fail');
      },
      cancel: async () => {
        calls.push('cancel');
      },
      log: (event: string) => {
        calls.push(event);
      },
      ...overrides,
    },
  };
}

test('leased AI worker redacts, persists, and completes with a stable effect', async () => {
  const { calls, deps } = dependencies();
  const result = await runMeetingAiWorkerOnce(deps);
  assert.deepEqual(result, { processed: 1, completed: 1, retried: 0, cancelled: 0, lost: 0 });
  assert.deepEqual(calls, ['persist', 'complete']);
});

test('leased AI worker cancels before provider work when consent is absent', async () => {
  let providerCalls = 0;
  const { calls, deps } = dependencies({
    hasConsent: async () => false,
    process: async () => {
      providerCalls++;
      return { transcriptText: 'never', effectHash: 'b'.repeat(64) };
    },
  });
  const result = await runMeetingAiWorkerOnce(deps);
  assert.equal(providerCalls, 0);
  assert.equal(result.cancelled, 1);
  assert.deepEqual(calls, ['cancel']);
});

test('leased AI worker retries provider failure and fences lease loss', async () => {
  const retry = dependencies({ process: async () => Promise.reject(new Error('timeout')) });
  assert.equal((await runMeetingAiWorkerOnce(retry.deps)).retried, 1);
  assert.deepEqual(retry.calls, ['meeting-ai.retryable-failure', 'fail']);

  const lost = dependencies({ process: async () => Promise.reject({ code: 'LEASE_LOST' }) });
  assert.equal((await runMeetingAiWorkerOnce(lost.deps)).lost, 1);
  assert.deepEqual(lost.calls, ['meeting-ai.lease-lost']);
});
