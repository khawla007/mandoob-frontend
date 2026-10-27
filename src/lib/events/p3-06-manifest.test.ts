import assert from 'node:assert/strict';
import test from 'node:test';

import { EVENT_INTERFACE_VERSION, parseRegisteredDomainEvent } from './contracts';
import { P3_06_EVENT_TYPES, p306EventManifest } from './p3-06-manifest';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const RESOURCE_ID = '44444444-4444-4444-8444-444444444444';
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const CORRELATION_ID = '55555555-5555-4555-8555-555555555555';

// A valid reference-only payload value for each field kind used by the manifest.
const sample: Record<string, unknown> = {
  uuid: RESOURCE_ID,
  state: 'in_progress',
  integer: 1,
};

function envelopeFor(eventType: string, payload: Record<string, unknown>) {
  return {
    eventId: EVENT_ID,
    eventType,
    eventVersion: 1,
    occurredAt: '2026-09-23T10:00:00.000Z',
    tenantId: TENANT_ID,
    companyId: COMPANY_ID,
    actorId: null,
    correlationId: CORRELATION_ID,
    causationId: null,
    privacyClass: 'restricted',
    payload,
  };
}

test('the manifest registers exactly the six P3.06 event contracts at version 1', () => {
  assert.equal(EVENT_INTERFACE_VERSION, '1.0.0');
  assert.deepEqual(Object.keys(p306EventManifest).sort(), [...P3_06_EVENT_TYPES].sort());
  for (const eventType of P3_06_EVENT_TYPES) {
    assert.deepEqual(Object.keys(p306EventManifest[eventType]), ['1']);
  }
});

test('every manifest payload validates against the frozen event-queue interface', () => {
  for (const eventType of P3_06_EVENT_TYPES) {
    const schema = p306EventManifest[eventType][1];
    const payload = Object.fromEntries(
      Object.entries(schema).map(([field, kind]) => [field, sample[kind]]),
    );
    const envelope = envelopeFor(eventType, payload);
    const parsed = parseRegisteredDomainEvent(envelope, p306EventManifest);
    assert.equal(parsed.eventType, eventType);
    // A payload missing a field or carrying an extra key must be rejected.
    assert.throws(
      () =>
        parseRegisteredDomainEvent(
          envelopeFor(eventType, { ...payload, extra: 1 }),
          p306EventManifest,
        ),
      /EVENT_PAYLOAD_SCHEMA_INVALID/,
    );
  }
});

test('an unregistered version fails closed', () => {
  assert.throws(
    () =>
      parseRegisteredDomainEvent(
        { ...envelopeFor('registration.created', {}), eventVersion: 2 },
        p306EventManifest,
      ),
    /EVENT_VERSION_UNSUPPORTED/,
  );
});
