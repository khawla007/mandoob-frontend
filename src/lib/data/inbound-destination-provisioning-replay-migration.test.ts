import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20261027100000_0122_inbound_destination_stable_replay.sql';

test('0122 persists an immutable least-privilege provisioning replay receipt', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /create table public\.inbound_destination_provisioning_receipts/i);
  assert.match(migration, /request_hash text not null/i);
  assert.match(migration, /destination_id uuid not null/i);
  assert.match(migration, /enabled boolean not null/i);
  assert.match(
    migration,
    /revoke all on table public\.inbound_destination_provisioning_receipts[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /before update or delete on public\.inbound_destination_provisioning_receipts/i,
  );
  assert.match(migration, /before truncate on public\.inbound_destination_provisioning_receipts/i);
});

test('0122 fingerprints the exact request and replays the immutable original result', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.doesNotMatch(migration, /pg_catalog\.coalesce/i);
  assert.match(migration, /create or replace function public\.provision_inbound_destination\(/i);
  assert.match(migration, /extensions\.digest[\s\S]*p_destination_key_hash/i);
  assert.match(migration, /p_readiness_approved[\s\S]*p_correlation_id/i);
  assert.match(
    migration,
    /from public\.inbound_destination_provisioning_receipts receipt[\s\S]*receipt\.operation_id = p_operation_id/i,
  );
  assert.match(migration, /v_receipt\.request_hash <> v_request_hash/i);
  assert.match(
    migration,
    /return query select v_receipt\.destination_id, v_receipt\.enabled, true/i,
  );
  assert.match(
    migration,
    /insert into public\.inbound_destination_provisioning_receipts[\s\S]*insert into public\.platform_audit_events/i,
  );
});
