import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261028110000_0123_inbound_lead_routing_replay.sql',
  'utf8',
);
const sqlContract = readFileSync('supabase/tests/inbound_webhook_atomic_lifecycle.sql', 'utf8');

test('inbound acceptance persists immutable routing identity and replays it on duplicates', () => {
  assert.match(migration, /add column channel text/i);
  assert.match(migration, /add column inbox_id bigint/i);
  assert.match(migration, /add column inbox_received_at timestamptz/i);
  assert.match(migration, /routing_key uuid/i);
  assert.match(migration, /return query select[\s\S]*'duplicate'::text/i);
  assert.match(migration, /v_receipt\.inbox_id/i);
  assert.match(migration, /INBOUND_RECEIPT_ROUTING_IMMUTABLE/i);
});

test('lead activity has a database-enforced stable operation key', () => {
  assert.match(migration, /lead_events_inbound_operation_key_uniq/i);
  assert.match(migration, /inbound_operation_key/i);
});

test('runtime SQL covers accepted-to-duplicate routing replay identity', () => {
  assert.match(sqlContract, /DUPLICATE_ROUTING_REPLAY_UNSTABLE/);
  assert.match(sqlContract, /INBOUND_OPERATION_KEY_NOT_UNIQUE/);
});
