import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261027060000_0118_inbound_webhook_atomic_lifecycle.sql',
  'utf8',
);
const qualificationMigration = readFileSync(
  'supabase/migrations/20261027070000_0119_inbound_webhook_returning_qualification.sql',
  'utf8',
);
const coalesceMigration = readFileSync(
  'supabase/migrations/20261027080000_0120_inbound_webhook_coalesce_fix.sql',
  'utf8',
);
const sqlContract = readFileSync('supabase/tests/inbound_webhook_atomic_lifecycle.sql', 'utf8');

test('atomic inbound RPC owns receipt, inbox, and consent writes in one transaction', () => {
  assert.match(migration, /create or replace function public\.accept_inbound_webhook\(/i);
  assert.match(migration, /insert into public\.inbound_webhook_receipts/i);
  assert.match(migration, /insert into public\.sms_inbox/i);
  assert.match(migration, /insert into public\.whatsapp_inbox/i);
  assert.match(migration, /insert into public\.consent_opt_outs/i);
  assert.match(migration, /update public\.inbound_webhook_receipts[\s\S]*status = 'processed'/i);
  assert.match(migration, /grant execute[\s\S]*accept_inbound_webhook[\s\S]*service_role/i);
  assert.match(migration, /revoke execute[\s\S]*reserve_inbound_webhook[\s\S]*service_role/i);
});

test('legacy enumerable destination hashes are versioned and disabled', () => {
  assert.match(migration, /enabled = false/i);
  assert.match(migration, /'v0:' \|\| destination_key_hash/i);
  assert.match(migration, /\^v[01]:\[a-f0-9\]\{64\}\$/i);
});

test('SQL contract proves failed inbox writes roll back receipts and remain retryable', () => {
  assert.match(sqlContract, /FAILED_WRITE_CONSUMED_EVENT_ID/);
  assert.match(sqlContract, /RETRY_NOT_ACCEPTED_AFTER_ROLLBACK/);
  assert.match(sqlContract, /DUPLICATE_NOT_CLASSIFIED/);
  assert.match(sqlContract, /UNKNOWN_NOT_CLASSIFIED/);
  assert.match(sqlContract, /STALE_NOT_CLASSIFIED/);
});

test('forward fix qualifies inbox RETURNING columns against PL/pgSQL output names', () => {
  assert.match(qualificationMigration, /insert into public\.sms_inbox as inbox/i);
  assert.match(qualificationMigration, /insert into public\.whatsapp_inbox as inbox/i);
  assert.equal(
    (qualificationMigration.match(/returning inbox\.id, inbox\.received_at/g) ?? []).length,
    2,
  );
});

test('forward fix leaves COALESCE unqualified as SQL syntax', () => {
  assert.match(coalesceMigration, /btrim\(coalesce\(p_body, ''\)\)/);
  assert.doesNotMatch(coalesceMigration, /pg_catalog\.coalesce/i);
});
