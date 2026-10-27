import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertReferenceOnlyPayload,
  projectP305Event,
  P3_05_CONSUMER_NAME,
  P3_05_EVENT_SCHEMAS,
  P3_05_EVENT_TYPES,
  P3_05_EVENT_VERSION,
} from './p3-05-manifest';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260922050000_0106_p3_05_public_intake.sql',
);

test('manifest mirrors the migration event contract and consumer registrations', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  for (const [type, schema] of Object.entries(P3_05_EVENT_SCHEMAS)) {
    const registration = `('${type}', ${P3_05_EVENT_VERSION}, '${JSON.stringify(schema)}')`;
    assert.ok(sql.includes(registration), `missing registration for ${type}: ${registration}`);
  }
  assert.ok(sql.includes(P3_05_CONSUMER_NAME));
  assert.deepEqual(P3_05_EVENT_TYPES.length, 6);
});

test('every payload field is a reference kind (ids, versions, state) with no free text', () => {
  const kinds = new Set(
    Object.values(P3_05_EVENT_SCHEMAS).flatMap((schema) => Object.values(schema)),
  );
  for (const kind of kinds) {
    assert.ok(['uuid', 'integer', 'state'].includes(kind), `unexpected payload kind: ${kind}`);
  }
});

test('projection consumer acknowledges reference-only payloads and rejects unsafe keys', () => {
  const projection = projectP305Event('application.accepted', {
    resource_id: 'app-1',
    lead_id: 'lead-1',
    operation_id: 'op-1',
    version: 1,
  });
  assert.deepEqual(projection, {
    eventType: 'application.accepted',
    resourceId: 'app-1',
    acknowledged: true,
  });

  assert.throws(() => assertReferenceOnlyPayload({ messageBody: 'hello' }), /reference-only/);
  assert.throws(() => assertReferenceOnlyPayload({ email: 'a@b.co' }), /reference-only/);
  assert.throws(() => assertReferenceOnlyPayload({ attachmentPath: '/x' }), /reference-only/);
  assert.throws(
    () => projectP305Event('contact.accepted', { resource_id: 'c-1', note: 'secret' }),
    /reference-only/,
  );
});
