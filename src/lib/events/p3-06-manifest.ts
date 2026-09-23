import type { EventPayloadSchema, EventSchemaRegistry } from './contracts';

// TS mirror of the six P3.06 domain-event contracts registered in migration
// 0107 (event_contract_registrations). Reference-only payloads: ids ('uuid'),
// codes/state ('state'), counters ('integer'). This manifest is the source of
// truth the publisher/consumer code validates against via
// parseRegisteredDomainEvent; the parity test asserts it matches the frozen
// event-queue interface shape.

const registrationCreated: EventPayloadSchema = {
  resource_id: 'uuid',
  company_id: 'uuid',
  operation_id: 'uuid',
  status: 'state',
  stage_code: 'state',
  version: 'integer',
};

const registrationStageChanged: EventPayloadSchema = {
  resource_id: 'uuid',
  company_id: 'uuid',
  stage_code: 'state',
  from_stage_status: 'state',
  to_stage_status: 'state',
  from_registration_stage: 'state',
  to_registration_stage: 'state',
  transition_code: 'state',
  registration_status: 'state',
  version: 'integer',
};

const registrationStageBlocked: EventPayloadSchema = {
  resource_id: 'uuid',
  company_id: 'uuid',
  stage_code: 'state',
  reason_code: 'state',
  registration_status: 'state',
  version: 'integer',
};

const registrationEvidenceLinked: EventPayloadSchema = {
  resource_id: 'uuid',
  company_id: 'uuid',
  stage_id: 'uuid',
  document_id: 'uuid',
  document_version_id: 'uuid',
  role: 'state',
};

const registrationVisaChanged: EventPayloadSchema = {
  resource_id: 'uuid',
  company_id: 'uuid',
  visa_person_id: 'uuid',
  stage_code: 'state',
  status: 'state',
  change: 'state',
  version: 'integer',
};

const registrationCompleted: EventPayloadSchema = {
  resource_id: 'uuid',
  company_id: 'uuid',
  status: 'state',
  version: 'integer',
};

export const P3_06_EVENT_TYPES = [
  'registration.created',
  'registration.stage_changed',
  'registration.stage_blocked',
  'registration.evidence_linked',
  'registration.visa_changed',
  'registration.completed',
] as const;

export type P306EventType = (typeof P3_06_EVENT_TYPES)[number];

export const p306EventManifest: EventSchemaRegistry = {
  'registration.created': { 1: registrationCreated },
  'registration.stage_changed': { 1: registrationStageChanged },
  'registration.stage_blocked': { 1: registrationStageBlocked },
  'registration.evidence_linked': { 1: registrationEvidenceLinked },
  'registration.visa_changed': { 1: registrationVisaChanged },
  'registration.completed': { 1: registrationCompleted },
};
