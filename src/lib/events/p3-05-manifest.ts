import type { EventPayloadSchema } from '@/lib/events/contracts';

// Canonical TS mirror of the P3.05 event contracts registered in migration 0106. Every entry
// must match `event_contract_registrations` exactly (asserted in the manifest test) so the DB
// and application stay in lockstep. Payloads are reference-only: ids, versions, and state.
export const P3_05_EVENT_VERSION = 1;
export const P3_05_CONSUMER_NAME = 'internal.p305.projection';

export const P3_05_EVENT_SCHEMAS = {
  'contact.accepted': { resource_id: 'uuid', operation_id: 'uuid', version: 'integer' },
  'application.draft_submitted': { resource_id: 'uuid', operation_id: 'uuid', version: 'integer' },
  'application.accepted': {
    resource_id: 'uuid',
    lead_id: 'uuid',
    operation_id: 'uuid',
    version: 'integer',
  },
  'lead.assigned': { resource_id: 'uuid', operation_id: 'uuid', version: 'integer' },
  'lead.stage_changed': {
    resource_id: 'uuid',
    operation_id: 'uuid',
    version: 'integer',
    state: 'state',
  },
  'lead.note_added': { resource_id: 'uuid', operation_id: 'uuid', version: 'integer' },
} as const satisfies Record<string, EventPayloadSchema>;

export type P305EventType = keyof typeof P3_05_EVENT_SCHEMAS;

export const P3_05_EVENT_TYPES = Object.keys(P3_05_EVENT_SCHEMAS) as P305EventType[];

// Guards that an event payload carries only opaque references — never message bodies,
// attachment paths, resume credentials, tokens, or raw contact data.
const FORBIDDEN_PAYLOAD_KEY =
  /(body|message|answer|attachment|path|secret|token|credential|email|phone|address|name|note|subject|error)/i;

export function assertReferenceOnlyPayload(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_PAYLOAD_KEY.test(key)) {
      throw new Error(`P3.05 event payload must be reference-only; forbidden key: ${key}`);
    }
  }
}

export type P305Projection = {
  eventType: P305EventType;
  resourceId: string;
  acknowledged: true;
};

// Local projection/acknowledgement consumer used only for domain proof. Real channel delivery,
// templates, preferences, and provider runtime remain P3.10-owned.
export function projectP305Event(
  eventType: P305EventType,
  payload: Record<string, unknown>,
): P305Projection {
  if (!P3_05_EVENT_SCHEMAS[eventType]) throw new Error(`Unknown P3.05 event type: ${eventType}`);
  assertReferenceOnlyPayload(payload);
  const resourceId = payload.resource_id;
  if (typeof resourceId !== 'string') throw new Error('P3.05 event payload missing resource_id');
  return { eventType, resourceId, acknowledged: true };
}
