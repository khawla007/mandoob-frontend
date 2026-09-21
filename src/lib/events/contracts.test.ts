import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EVENT_INTERFACE_VERSION,
  createProviderEffectKey,
  domainEventEnvelopeSchema,
  hashDestinationKey,
  isWebhookTimestampWithinTolerance,
  parseRegisteredDomainEvent,
  retryDelayMs,
  toSafeProviderFailure,
} from './contracts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const CORRELATION_ID = '44444444-4444-4444-8444-444444444444';

const validEnvelope = {
  eventId: EVENT_ID,
  eventType: 'documents.requested',
  eventVersion: 1,
  occurredAt: '2026-09-21T04:30:00.000Z',
  tenantId: TENANT_ID,
  companyId: COMPANY_ID,
  actorId: null,
  correlationId: CORRELATION_ID,
  causationId: null,
  privacyClass: 'confidential',
  payload: { documentRequestId: 'request-reference' },
} as const;

const eventSchemas = {
  'documents.requested': {
    1: { documentRequestId: 'reference' },
  },
} as const;

describe('domain event envelope', () => {
  test('accepts the frozen v1 ownership and correlation contract', () => {
    assert.deepEqual(domainEventEnvelopeSchema.parse(validEnvelope), validEnvelope);
    assert.equal(EVENT_INTERFACE_VERSION, '1.0.0');
  });

  test('rejects company ownership without tenant ownership', () => {
    const result = domainEventEnvelopeSchema.safeParse({
      ...validEnvelope,
      tenantId: null,
    });
    assert.equal(result.success, false);
  });

  test('rejects malformed event names, identifiers, versions, timestamps, and array payloads', () => {
    const invalid = [
      { eventType: 'Documents Requested' },
      { eventId: 'not-a-uuid' },
      { eventVersion: 0 },
      { occurredAt: 'yesterday' },
      { payload: ['protected', 'message'] },
    ];

    for (const patch of invalid) {
      assert.equal(
        domainEventEnvelopeSchema.safeParse({ ...validEnvelope, ...patch }).success,
        false,
      );
    }
  });

  test('fails closed for an unregistered event version', () => {
    assert.throws(
      () => parseRegisteredDomainEvent(validEnvelope, { 'documents.requested': {} }),
      /EVENT_VERSION_UNSUPPORTED/,
    );
  });

  test('enforces the exact registered payload schema before publication', () => {
    assert.deepEqual(parseRegisteredDomainEvent(validEnvelope, eventSchemas), validEnvelope);

    for (const payload of [
      { body: 'Call 0501234567' },
      { content: 'synthetic content' },
      { text: 'synthetic text' },
      { contactName: 'Synthetic Person' },
      { address: 'Synthetic Street' },
      { documentRequestId: 'valid-reference', unexpected: true },
      { documentRequestId: 42 },
    ]) {
      assert.throws(
        () => parseRegisteredDomainEvent({ ...validEnvelope, payload }, eventSchemas),
        /EVENT_PAYLOAD_SCHEMA_INVALID/,
      );
    }
  });

  test('rejects payload keys and values that can retain communications, credentials, or PII', () => {
    for (const payload of [
      { messageBody: 'Your renewal is due' },
      { nested: { authorizationHeader: 'Bearer private-token' } },
      { contact: 'user@example.com' },
      { destination: '+971501234567' },
      { provider: { rawResponse: 'private provider response' } },
    ]) {
      assert.equal(
        domainEventEnvelopeSchema.safeParse({ ...validEnvelope, payload }).success,
        false,
      );
    }
  });
});

describe('queue retry and provider safety', () => {
  test('uses deterministic bounded exponential backoff with jitter', () => {
    const attemptOne = retryDelayMs(EVENT_ID, 1);
    const attemptFour = retryDelayMs(EVENT_ID, 4);
    const attemptTwentyFive = retryDelayMs(EVENT_ID, 25);

    assert.ok(attemptOne >= 96_000 && attemptOne <= 144_000);
    assert.ok(attemptFour > attemptOne);
    assert.ok(attemptTwentyFive <= 3_600_000);
    assert.equal(retryDelayMs(EVENT_ID, 4), attemptFour);
    assert.throws(() => retryDelayMs(EVENT_ID, 0), /INVALID_RETRY_ATTEMPT/);
  });

  test('creates a stable effect key without recipient or payload material', () => {
    const key = createProviderEffectKey(EVENT_ID);
    assert.equal(key, `mandoob:event-job:${EVENT_ID}`);
    assert.equal(key.includes('@'), false);
    assert.equal(key.includes('+971'), false);
  });

  test('allowlists provider error categories and removes raw protected material', () => {
    const safe = toSafeProviderFailure({
      category: 'rate_limited',
      code: 'PROVIDER_RATE_LIMITED',
      retryable: true,
      message: 'Bearer secret-token to +971501234567 user@example.com',
      response: { access_token: 'secret-token' },
    });

    assert.deepEqual(safe, {
      category: 'rate_limited',
      code: 'PROVIDER_RATE_LIMITED',
      retryable: true,
    });
    assert.equal(JSON.stringify(safe).includes('secret-token'), false);
    assert.equal(JSON.stringify(safe).includes('+971'), false);
  });

  test('maps unknown provider failures to a terminal sanitized code', () => {
    assert.deepEqual(toSafeProviderFailure(new Error('smtp password=secret')), {
      category: 'unknown',
      code: 'PROVIDER_FAILURE',
      retryable: false,
    });
  });

  test('maps caller-controlled uppercase provider codes to the safe fallback', () => {
    assert.deepEqual(
      toSafeProviderFailure({
        category: 'provider_unavailable',
        code: 'SECRET_BEARER_VALUE',
        retryable: true,
      }),
      { category: 'unknown', code: 'PROVIDER_FAILURE', retryable: false },
    );
  });
});

describe('inbound destination and replay boundaries', () => {
  test('hashes normalized provider destinations without retaining the raw key', () => {
    const first = hashDestinationKey('twilio', '  +971 50 123 4567 ');
    const second = hashDestinationKey('twilio', '+971501234567');

    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(first.includes('971'), false);
  });

  test('enforces an inclusive five-minute webhook timestamp tolerance', () => {
    const now = Date.parse('2026-09-21T04:30:00.000Z');
    assert.equal(isWebhookTimestampWithinTolerance('2026-09-21T04:25:00.000Z', now), true);
    assert.equal(isWebhookTimestampWithinTolerance('2026-09-21T04:35:00.001Z', now), false);
    assert.equal(isWebhookTimestampWithinTolerance('invalid', now), false);
  });
});
