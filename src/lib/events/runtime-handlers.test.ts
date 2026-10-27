import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import type { ImportWorkerDeps } from '@/lib/employees/import-worker';
import type { MeetingAiWorkerDeps } from '@/lib/meetings/ai-worker';
import type { ClaimedEventJob } from './repository';
import { EventHandlerFailure } from './worker';
import {
  ENABLED_RUNTIME_REGISTRATIONS,
  createEmployeeImportEventHandler,
  createMeetingAiEventHandler,
  createRuntimeHandlerRegistry,
  excludedRuntimeConsumers,
  mixedConsumerBacklogDisposition,
  scheduledRuntimeConsumers,
} from './runtime-handlers';
import { handlerKey } from './worker';

const ids = {
  job: '11111111-1111-4111-8111-111111111111',
  event: '22222222-2222-4222-8222-222222222222',
  worker: '33333333-3333-4333-8333-333333333333',
  lease: '44444444-4444-4444-8444-444444444444',
  tenant: '55555555-5555-4555-8555-555555555555',
  company: '66666666-6666-4666-8666-666666666666',
  correlation: '77777777-7777-4777-8777-777777777777',
} as const;

function claimed(eventType: string, consumerName: string): ClaimedEventJob {
  return {
    jobId: ids.job,
    eventId: ids.event,
    workerId: ids.worker,
    consumerName,
    attemptNumber: 1,
    maxAttempts: 5,
    leaseToken: ids.lease,
    leaseExpiresAt: '2026-10-27T10:02:00.000Z',
    effectKey: `mandoob:event-job:${ids.job}`,
    eventType,
    eventVersion: 1,
    occurredAt: '2026-10-27T10:00:00.000Z',
    tenantId: ids.tenant,
    companyId: ids.company,
    actorId: null,
    correlationId: ids.correlation,
    causationId: null,
    privacyClass: 'internal',
    payload: { resource_id: ids.event, version: 1, change: 'updated' },
  };
}

describe('runtime handler registry', () => {
  test('explicitly dispositions all 30 enabled registrations from migrations 0105-0111', () => {
    assert.deepEqual(
      ENABLED_RUNTIME_REGISTRATIONS.map(
        ({ consumerName, eventType, eventVersion, status }) =>
          `${consumerName}|${eventType}|${eventVersion}|${status}`,
      ),
      [
        'internal.lifecycle.projection|company.onboarding.section_saved|1|local',
        'internal.lifecycle.projection|company.onboarding.submitted|1|local',
        'internal.lifecycle.projection|company.onboarding.activated|1|local',
        'internal.lifecycle.projection|company.settings.updated|1|local',
        'internal.lifecycle.projection|pro.credential.submitted|1|pending',
        'internal.lifecycle.projection|pro.credential.decided|1|pending',
        'internal.lifecycle.projection|pro.credential.evidence_changed|1|pending',
        'internal.lifecycle.projection|pro.commercial_terms.changed|1|pending',
        'internal.lifecycle.projection|registration.created|1|local',
        'internal.lifecycle.projection|registration.stage_changed|1|local',
        'internal.lifecycle.projection|registration.stage_blocked|1|local',
        'internal.lifecycle.projection|registration.evidence_linked|1|local',
        'internal.lifecycle.projection|registration.visa_changed|1|local',
        'internal.lifecycle.projection|registration.completed|1|local',
        'internal.p305.projection|contact.accepted|1|pending',
        'internal.p305.projection|application.draft_submitted|1|pending',
        'internal.p305.projection|application.accepted|1|pending',
        'internal.p305.projection|lead.assigned|1|pending',
        'internal.p305.projection|lead.stage_changed|1|pending',
        'internal.p305.projection|lead.note_added|1|pending',
        'internal.employee_renewal.projection|employee.record.changed|1|local',
        'internal.employee_renewal.projection|employee.import.finished|1|local',
        'internal.employee_renewal.projection|renewal.lifecycle.changed|1|local',
        'p308.employee_import.executor|employee.import.requested|1|adapter',
        'internal.renewal_reminder.delivery|renewal.reminder.scheduled|1|local',
        'internal.renewal_reminder.delivery|renewal.attention.daily|1|local',
        'internal.meeting.invitation|meeting.booked|1|local',
        'internal.meeting.invitation|meeting.rescheduled|1|local',
        'internal.meeting.invitation|meeting.cancelled|1|local',
        'p311.meeting_ai.processor|meeting.ai.requested|1|provider-disabled',
      ],
    );
    assert.deepEqual(scheduledRuntimeConsumers, [
      'internal.employee_renewal.projection',
      'p308.employee_import.executor',
      'internal.renewal_reminder.delivery',
      'internal.meeting.invitation',
    ]);
    assert.deepEqual(excludedRuntimeConsumers, [
      'internal.lifecycle.projection',
      'internal.p305.projection',
      'p311.meeting_ai.processor',
    ]);
    assert.deepEqual(mixedConsumerBacklogDisposition, {
      consumerName: 'internal.lifecycle.projection',
      status: 'pending',
      reason: 'MIXED_SCOPED_AND_UNSCOPED_REGISTRATIONS',
    });
  });

  test('writes a local idempotent projection through the fenced 0114 boundary', async () => {
    const writes: unknown[] = [];
    const registry = createRuntimeHandlerRegistry({
      writeProjection: async (input) => (
        writes.push(input),
        { effectReferenceHash: 'a'.repeat(64) }
      ),
      employeeImport: async () => ({}),
      meetingAi: async () => ({ effectReferenceHash: 'b'.repeat(64) }),
    });
    const job = claimed('employee.record.changed', 'internal.employee_renewal.projection');
    const handler = registry.handlers.get(handlerKey(job.consumerName, job.eventType, 1));
    assert.ok(handler);
    const result = await handler(job, { checkpoint: async () => {} });

    assert.equal(result.effectReferenceHash, 'a'.repeat(64));
    assert.deepEqual(writes[0], {
      operationId: ids.job,
      tenantId: ids.tenant,
      companyId: ids.company,
      eventId: ids.event,
      jobId: ids.job,
      workerId: ids.worker,
      leaseToken: ids.lease,
      projectionType: 'activity',
      projectionKey: 'internal.employee_renewal.projection.employee.record.changed',
      code: 'EMPLOYEE_RECORD_CHANGED',
      profileId: null,
      state: null,
      priority: null,
      dueAt: null,
      safeMetadata: job.payload,
    });
  });

  test('uses the stable root effect UUID as projection operation identity on replay', async () => {
    const writes: Array<{ operationId: string; jobId: string; leaseToken: string }> = [];
    const registry = createRuntimeHandlerRegistry({
      writeProjection: async (input) => (
        writes.push({
          operationId: input.operationId,
          jobId: input.jobId,
          leaseToken: input.leaseToken,
        }),
        {}
      ),
      employeeImport: async () => ({}),
      meetingAi: async () => ({}),
    });
    const replayJob = claimed('employee.record.changed', 'internal.employee_renewal.projection');
    replayJob.jobId = '88888888-8888-4888-8888-888888888888';
    replayJob.leaseToken = '99999999-9999-4999-8999-999999999999';
    const handler = registry.handlers.get(
      handlerKey(replayJob.consumerName, replayJob.eventType, 1),
    );
    assert.ok(handler);
    await handler(replayJob, { checkpoint: async () => {} });
    assert.deepEqual(writes[0], {
      operationId: ids.job,
      jobId: replayJob.jobId,
      leaseToken: replayJob.leaseToken,
    });
  });

  test('P3.08 adapter preserves reconcile and terminal versus retry outcomes', async () => {
    const csv = new TextEncoder().encode('name,passport_no\nPerson One,P0000001\n');
    const scenarios = [
      { failure: { code: 'VALIDATION_FAILED' }, attempt: 1, terminal: 'IMPORT_BATCH_REJECTED' },
      { failure: new Error('network'), attempt: 5, terminal: 'IMPORT_ATTEMPTS_EXHAUSTED' },
    ] as const;
    for (const scenario of scenarios) {
      const calls: string[] = [];
      const deps = importDeps(calls, csv, scenario.failure);
      const handler = createEmployeeImportEventHandler(async () => deps);
      const result = await handler(
        {
          ...claimed('employee.import.requested', 'p308.employee_import.executor'),
          attemptNumber: scenario.attempt,
        },
        { checkpoint: async () => {} },
      );
      assert.deepEqual(result, {});
      assert.deepEqual(
        calls.filter((call) => call.startsWith('finalize:')),
        [`finalize:${scenario.terminal}`],
      );
      assert.equal(calls.includes('reconcile'), true);
      assert.equal(calls.includes('inner-complete') || calls.includes('inner-fail'), false);
    }

    const retryCalls: string[] = [];
    const retryHandler = createEmployeeImportEventHandler(async () =>
      importDeps(retryCalls, csv, new Error('network')),
    );
    await assert.rejects(
      retryHandler(claimed('employee.import.requested', 'p308.employee_import.executor'), {
        checkpoint: async () => {},
      }),
      (error) =>
        error instanceof EventHandlerFailure &&
        error.failure.category === 'provider_unavailable' &&
        error.failure.code === 'PROVIDER_UNAVAILABLE' &&
        error.failure.retryable,
    );
    assert.equal(retryCalls.includes('reconcile'), true);
    assert.equal(retryCalls.includes('inner-fail'), false);
  });

  test('P3.11 adapter preserves cancellation/completion and surfaces one outer retry', async () => {
    const cancelled: string[] = [];
    const cancelHandler = createMeetingAiEventHandler(async () => meetingDeps(cancelled, false));
    assert.deepEqual(
      await cancelHandler(claimed('meeting.ai.requested', 'p311.meeting_ai.processor'), {
        checkpoint: async () => {},
      }),
      { outcome: 'already-terminal' },
    );
    assert.deepEqual(cancelled, ['cancel']);

    const rejectedCancel = createMeetingAiEventHandler(async () =>
      meetingDeps([], false, undefined, false),
    );
    await assert.rejects(
      rejectedCancel(claimed('meeting.ai.requested', 'p311.meeting_ai.processor'), {
        checkpoint: async () => {},
        signal: new AbortController().signal,
      }),
      (error) =>
        error instanceof EventHandlerFailure &&
        error.failure.category === 'provider_unavailable' &&
        error.failure.code === 'PROVIDER_UNAVAILABLE' &&
        error.failure.retryable,
    );

    const completed: string[] = [];
    const completeHandler = createMeetingAiEventHandler(async () => meetingDeps(completed, true));
    assert.deepEqual(
      await completeHandler(claimed('meeting.ai.requested', 'p311.meeting_ai.processor'), {
        checkpoint: async () => {},
      }),
      { effectReferenceHash: 'a'.repeat(64) },
    );
    assert.deepEqual(completed, ['persist']);

    const retried: string[] = [];
    const retryHandler = createMeetingAiEventHandler(async () =>
      meetingDeps(retried, true, new Error('provider unavailable')),
    );
    await assert.rejects(
      retryHandler(claimed('meeting.ai.requested', 'p311.meeting_ai.processor'), {
        checkpoint: async () => {},
      }),
      (error) =>
        error instanceof EventHandlerFailure &&
        error.failure.category === 'provider_unavailable' &&
        error.failure.code === 'PROVIDER_UNAVAILABLE' &&
        error.failure.retryable,
    );
    assert.equal(retried.includes('inner-fail'), false);
  });

  test('adapts employee import and meeting AI but schedules no provider effect', async () => {
    const called: string[] = [];
    const registry = createRuntimeHandlerRegistry({
      writeProjection: async () => ({}),
      employeeImport: async () => (called.push('employee'), {}),
      meetingAi: async () => (called.push('meeting-ai'), {}),
    });
    const importJob = claimed('employee.import.requested', 'p308.employee_import.executor');
    await registry.handlers.get(handlerKey(importJob.consumerName, importJob.eventType, 1))!(
      importJob,
      { checkpoint: async () => {} },
    );
    assert.deepEqual(called, ['employee']);
    assert.equal(
      registry.handlers.has(handlerKey('p311.meeting_ai.processor', 'meeting.ai.requested', 1)),
      true,
    );
    const scheduled: readonly string[] = scheduledRuntimeConsumers;
    assert.equal(scheduled.includes('p311.meeting_ai.processor'), false);
    assert.equal(scheduled.includes('internal.lifecycle.projection'), false);
    assert.equal(scheduled.includes('internal.p305.projection'), false);
    assert.equal(
      registry.handlers.has(handlerKey('internal.lifecycle.projection', 'registration.created', 1)),
      true,
    );
    assert.equal(
      registry.handlers.has(
        handlerKey('internal.lifecycle.projection', 'pro.credential.submitted', 1),
      ),
      false,
    );
  });

  test('fails local projection creation closed when company scope is absent', async () => {
    const registry = createRuntimeHandlerRegistry({
      writeProjection: async () => ({}),
      employeeImport: async () => ({}),
      meetingAi: async () => ({}),
    });
    const job = claimed('meeting.booked', 'internal.meeting.invitation');
    const handler = registry.handlers.get(handlerKey(job.consumerName, job.eventType, 1));
    assert.ok(handler);
    await assert.rejects(
      handler({ ...job, companyId: null }, { checkpoint: async () => {} }),
      (error) =>
        error instanceof EventHandlerFailure &&
        error.failure.category === 'malformed_payload' &&
        error.failure.code === 'EVENT_PAYLOAD_INVALID' &&
        !error.failure.retryable,
    );
  });
});

function importDeps(calls: string[], csv: Uint8Array, batchFailure: unknown): ImportWorkerDeps {
  return {
    workerId: ids.worker,
    claim: async () => [],
    reconcile: async () => (calls.push('reconcile'), 0),
    readExecution: async () => ({
      status: 'importing',
      tenantId: ids.tenant,
      companyId: ids.company,
      storagePath: 'opaque/path',
      artifactSha256: createHash('sha256').update(csv).digest('hex'),
      totalRows: 1,
      nextRow: 0,
      nextBatch: 0,
      cancelRequested: false,
    }),
    downloadArtifact: async () => csv,
    decryptArtifact: (value) => value,
    recordAccess: async () => {},
    sealEmployee: () => ({}),
    applyBatch: async () => {
      throw batchFailure;
    },
    finalize: async (_claim, failureCode) => (
      calls.push(`finalize:${failureCode ?? 'none'}`),
      { state: 'failed' }
    ),
    complete: async () => {
      calls.push('inner-complete');
    },
    fail: async () => {
      calls.push('inner-fail');
    },
    log: () => {},
  };
}

function meetingDeps(
  calls: string[],
  consent: boolean,
  processFailure?: Error,
  cancelResult = true,
): MeetingAiWorkerDeps {
  return {
    workerId: ids.worker,
    claim: async () => [],
    hasConsent: async () => consent,
    process: async () => {
      if (processFailure) throw processFailure;
      return { transcriptText: 'safe', effectHash: 'a'.repeat(64) };
    },
    persist: async () => {
      calls.push('persist');
    },
    complete: async () => {
      calls.push('inner-complete');
    },
    fail: async () => {
      calls.push('inner-fail');
    },
    cancel: async () => {
      calls.push('cancel');
      return cancelResult;
    },
    log: () => {},
  };
}
