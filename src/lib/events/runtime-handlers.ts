import type { EventSchemaRegistry } from './contracts';
import { handlerKey, type EventJobHandler } from './worker';

type RegistrationStatus = 'local' | 'adapter' | 'unsupported' | 'provider-disabled';
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
  ...registrations('internal.lifecycle.projection', 'unsupported', [
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
  ...registrations('internal.p305.projection', 'unsupported', [
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
    return writeProjection({
      operationId: job.jobId,
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
