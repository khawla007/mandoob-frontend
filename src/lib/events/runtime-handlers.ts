import type { EventSchemaRegistry } from './contracts';
import {
  runEmployeeImportWorkerOnce,
  type ImportClaim,
  type ImportWorkerDeps,
} from '@/lib/employees/import-worker';
import {
  runMeetingAiWorkerOnce,
  type MeetingAiClaim,
  type MeetingAiWorkerDeps,
} from '@/lib/meetings/ai-worker';
import { handlerKey, type EventJobHandler } from './worker';

type RegistrationStatus = 'local' | 'adapter' | 'pending' | 'provider-disabled';
type RuntimeRegistration = {
  consumerName: string;
  eventType: string;
  eventVersion: 1;
  status: RegistrationStatus;
};

function registrations(
  consumerName: string,
  status: RegistrationStatus,
  eventTypes: readonly string[],
): RuntimeRegistration[] {
  return eventTypes.map((eventType) => ({ consumerName, eventType, eventVersion: 1, status }));
}

export const ENABLED_RUNTIME_REGISTRATIONS: readonly RuntimeRegistration[] = [
  ...registrations('internal.lifecycle.projection', 'local', [
    'company.onboarding.section_saved',
    'company.onboarding.submitted',
    'company.onboarding.activated',
    'company.settings.updated',
  ]),
  ...registrations('internal.lifecycle.projection', 'pending', [
    'pro.credential.submitted',
    'pro.credential.decided',
    'pro.credential.evidence_changed',
    'pro.commercial_terms.changed',
  ]),
  ...registrations('internal.lifecycle.projection', 'local', [
    'registration.created',
    'registration.stage_changed',
    'registration.stage_blocked',
    'registration.evidence_linked',
    'registration.visa_changed',
    'registration.completed',
  ]),
  ...registrations('internal.p305.projection', 'pending', [
    'contact.accepted',
    'application.draft_submitted',
    'application.accepted',
    'lead.assigned',
    'lead.stage_changed',
    'lead.note_added',
  ]),
  ...registrations('internal.employee_renewal.projection', 'local', [
    'employee.record.changed',
    'employee.import.finished',
    'renewal.lifecycle.changed',
  ]),
  ...registrations('p308.employee_import.executor', 'adapter', ['employee.import.requested']),
  ...registrations('internal.renewal_reminder.delivery', 'local', [
    'renewal.reminder.scheduled',
    'renewal.attention.daily',
  ]),
  ...registrations('internal.meeting.invitation', 'local', [
    'meeting.booked',
    'meeting.rescheduled',
    'meeting.cancelled',
  ]),
  ...registrations('p311.meeting_ai.processor', 'provider-disabled', ['meeting.ai.requested']),
] as const;

export const scheduledRuntimeConsumers = [
  'internal.employee_renewal.projection',
  'p308.employee_import.executor',
  'internal.renewal_reminder.delivery',
  'internal.meeting.invitation',
] as const;

export const excludedRuntimeConsumers = [
  'internal.lifecycle.projection',
  'internal.p305.projection',
  'p311.meeting_ai.processor',
] as const;

export const mixedConsumerBacklogDisposition = {
  consumerName: 'internal.lifecycle.projection',
  status: 'pending',
  reason: 'MIXED_SCOPED_AND_UNSCOPED_REGISTRATIONS',
} as const;

export const RUNTIME_EVENT_SCHEMAS = {
  'employee.record.changed': {
    1: { resource_id: 'uuid', operation_id: 'uuid', version: 'integer', change: 'state' },
  },
  'employee.import.requested': {
    1: { resource_id: 'uuid', operation_id: 'uuid', version: 'integer' },
  },
  'employee.import.finished': { 1: { resource_id: 'uuid', version: 'integer', state: 'state' } },
  'renewal.lifecycle.changed': {
    1: {
      resource_id: 'uuid',
      operation_id: 'uuid',
      version: 'integer',
      stage: 'state',
      change: 'state',
    },
  },
  'renewal.reminder.scheduled': {
    1: { resource_id: 'uuid', version: 'integer', window_days: 'integer', stage: 'state' },
  },
  'renewal.attention.daily': {
    1: { resource_id: 'uuid', version: 'integer', days_remaining: 'integer', state: 'state' },
  },
  'meeting.booked': {
    1: { resource_id: 'uuid', operation_id: 'uuid', version: 'integer', state: 'state' },
  },
  'meeting.rescheduled': {
    1: { resource_id: 'uuid', operation_id: 'uuid', version: 'integer', state: 'state' },
  },
  'meeting.cancelled': {
    1: { resource_id: 'uuid', operation_id: 'uuid', version: 'integer', state: 'state' },
  },
  'meeting.ai.requested': {
    1: { resource_id: 'uuid', operation_id: 'uuid', version: 'integer', state: 'state' },
  },
} as const satisfies EventSchemaRegistry;

export type ProjectionWrite = {
  operationId: string;
  tenantId: string;
  companyId: string;
  eventId: string;
  jobId: string;
  workerId: string;
  leaseToken: string;
  projectionType: 'activity' | 'task';
  projectionKey: string;
  code: string;
  profileId: string | null;
  state: string | null;
  priority: string | null;
  dueAt: string | null;
  safeMetadata: Record<string, unknown>;
};

type RuntimeHandlerDependencies = {
  writeProjection(input: ProjectionWrite): Promise<{ effectReferenceHash?: string }>;
  employeeImport: EventJobHandler;
  meetingAi: EventJobHandler;
};

function localHandler(
  writeProjection: RuntimeHandlerDependencies['writeProjection'],
): EventJobHandler {
  return async (job, context) => {
    if (!job.tenantId || !job.companyId) throw new Error('RUNTIME_REFERENCE_SCOPE_REQUIRED');
    await context.checkpoint();
    const reminder = job.consumerName === 'internal.renewal_reminder.delivery';
    const operationId = job.effectKey.slice('mandoob:event-job:'.length);
    return writeProjection({
      operationId,
      tenantId: job.tenantId,
      companyId: job.companyId,
      eventId: job.eventId,
      jobId: job.jobId,
      workerId: job.workerId,
      leaseToken: job.leaseToken,
      projectionType: reminder ? 'task' : 'activity',
      projectionKey: `${job.consumerName}.${job.eventType}`,
      code: job.eventType.replaceAll('.', '_').toUpperCase(),
      profileId: null,
      state: reminder ? 'open' : null,
      priority: reminder ? 'normal' : null,
      dueAt: null,
      safeMetadata: job.payload,
    });
  };
}

function importClaim(job: Parameters<EventJobHandler>[0]): ImportClaim {
  const importJobId = job.payload.resource_id;
  if (typeof importJobId !== 'string') throw new Error('IMPORT_REFERENCE_INVALID');
  return {
    eventJobId: job.jobId,
    leaseToken: job.leaseToken,
    importJobId,
    attempt: job.attemptNumber,
    maxAttempts: job.maxAttempts,
  };
}

export function createEmployeeImportEventHandler(
  dependencies: (job: Parameters<EventJobHandler>[0]) => Promise<ImportWorkerDeps>,
): EventJobHandler {
  return async (job, context) => {
    const claim = importClaim(job);
    const deps = await dependencies(job);
    const summary = await runEmployeeImportWorkerOnce({
      ...deps,
      claim: async () => [claim],
      complete: async () => {},
      fail: async () => {},
      checkpoint: context.checkpoint,
    });
    if (summary.lost) return { outcome: 'lease-lost' };
    if (summary.retried) throw new Error('EMPLOYEE_IMPORT_RETRYABLE');
    if (summary.completed !== 1) throw new Error('EMPLOYEE_IMPORT_INCOMPLETE');
    return {};
  };
}

function meetingClaim(job: Parameters<EventJobHandler>[0]): MeetingAiClaim {
  const meetingId = job.payload.resource_id;
  if (typeof meetingId !== 'string') throw new Error('MEETING_REFERENCE_INVALID');
  return {
    eventJobId: job.jobId,
    leaseToken: job.leaseToken,
    meetingId,
    attempt: job.attemptNumber,
    maxAttempts: job.maxAttempts,
  };
}

export function createMeetingAiEventHandler(
  dependencies: (job: Parameters<EventJobHandler>[0]) => Promise<MeetingAiWorkerDeps>,
): EventJobHandler {
  return async (job, context) => {
    const claim = meetingClaim(job);
    const deps = await dependencies(job);
    let effectReferenceHash: string | undefined;
    const summary = await runMeetingAiWorkerOnce({
      ...deps,
      claim: async () => [claim],
      complete: async (_claim, effectHash) => {
        effectReferenceHash = effectHash;
      },
      fail: async () => {},
      checkpoint: context.checkpoint,
    });
    if (summary.lost) return { outcome: 'lease-lost' };
    if (summary.retried) throw new Error('MEETING_AI_RETRYABLE');
    if (summary.completed === 1 || summary.cancelled === 1) {
      return effectReferenceHash
        ? { outcome: 'already-terminal', effectReferenceHash }
        : { outcome: 'already-terminal' };
    }
    throw new Error('MEETING_AI_INCOMPLETE');
  };
}

export function createRuntimeHandlerRegistry(dependencies: RuntimeHandlerDependencies): {
  handlers: ReadonlyMap<string, EventJobHandler>;
} {
  const handlers = new Map<string, EventJobHandler>();
  for (const registration of ENABLED_RUNTIME_REGISTRATIONS) {
    let handler: EventJobHandler | undefined;
    if (registration.status === 'local') handler = localHandler(dependencies.writeProjection);
    if (registration.status === 'adapter') handler = dependencies.employeeImport;
    if (registration.status === 'provider-disabled') handler = dependencies.meetingAi;
    if (handler) {
      handlers.set(
        handlerKey(registration.consumerName, registration.eventType, registration.eventVersion),
        handler,
      );
    }
  }
  return { handlers };
}
