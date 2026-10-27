import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ClaimedEventJob } from './repository';
import {
  ENABLED_RUNTIME_REGISTRATIONS,
  createRuntimeHandlerRegistry,
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
    assert.equal(ENABLED_RUNTIME_REGISTRATIONS.length, 30);
    assert.equal(
      new Set(
        ENABLED_RUNTIME_REGISTRATIONS.map((registration) =>
          handlerKey(registration.consumerName, registration.eventType, registration.eventVersion),
        ),
      ).size,
      30,
    );
    assert.equal(
      ENABLED_RUNTIME_REGISTRATIONS.every((registration) => registration.status !== undefined),
      true,
    );
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
      /RUNTIME_REFERENCE_SCOPE_REQUIRED/,
    );
  });
});
