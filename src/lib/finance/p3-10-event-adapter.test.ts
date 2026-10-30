import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  P309_EVENT_INTERFACE_VERSION,
  P309_FINANCE_EVENT_SCHEMAS_V1,
  parseP309FinanceEvent,
} from './p3-10-event-adapter';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const RESOURCE_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const COMPANY_ID = '44444444-4444-4444-8444-444444444444';

const invoiceEvent = {
  eventId: '55555555-5555-4555-8555-555555555555',
  eventType: 'finance.invoice.finalized',
  eventVersion: 1,
  occurredAt: '2026-09-22T08:00:00.000Z',
  tenantId: TENANT_ID,
  companyId: COMPANY_ID,
  actorId: null,
  correlationId: OPERATION_ID,
  causationId: null,
  privacyClass: 'internal',
  payload: {
    resource_id: RESOURCE_ID,
    operation_id: OPERATION_ID,
    version: 2,
    state: 'open',
    amount_minor: 10_500,
    currency: 'AED',
  },
} as const;

test('uses the frozen P3.10 v1.0.0 envelope and exact P3.09 payload registry', () => {
  assert.equal(P309_EVENT_INTERFACE_VERSION, '1.0.0');
  assert.deepEqual(parseP309FinanceEvent(invoiceEvent), invoiceEvent);
  assert.deepEqual(P309_FINANCE_EVENT_SCHEMAS_V1['finance.invoice.finalized'][1], {
    resource_id: 'uuid',
    operation_id: 'uuid',
    version: 'integer',
    state: 'state',
    amount_minor: 'integer',
    currency: 'reference',
  });
});

test('requires the operation reference to be the stable correlation identifier', () => {
  assert.throws(
    () => parseP309FinanceEvent({ ...invoiceEvent, correlationId: RESOURCE_ID }),
    /EVENT_CORRELATION_MISMATCH/u,
  );
});

test('rejects extra, PII, secret, and raw-provider payload material', () => {
  for (const payload of [
    { ...invoiceEvent.payload, email: 'person@example.com' },
    { ...invoiceEvent.payload, signature: 'secret' },
    { ...invoiceEvent.payload, raw_response: '{}' },
    { ...invoiceEvent.payload, unexpected: true },
  ]) {
    assert.throws(() => parseP309FinanceEvent({ ...invoiceEvent, payload }));
  }
});

test('source migrations register v1 reference schemas and publish inside transactions', () => {
  const files = [
    'supabase/migrations/20260922091000_p309_finance_commands.sql',
    'supabase/migrations/20260922092000_p309_bank_evidence.sql',
    'supabase/migrations/20260922093000_p309_tap_integration.sql',
  ];

  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    assert.match(sql, /^begin;/mu, file);
    assert.match(sql, /event_contract_registrations/u, file);
    assert.match(sql, /(?:publish_domain_event|p309_publish_event)/u, file);
    assert.match(sql, /commit;/u, file);
    assert.doesNotMatch(
      sql.slice(0, sql.indexOf('on conflict', sql.indexOf('event_contract_registrations'))),
      /email|phone|secret|signature|raw_response/iu,
      file,
    );
  }
});
