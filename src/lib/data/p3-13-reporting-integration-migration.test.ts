import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20261027010000_0113_p3_13_reporting_source_integration.sql',
  ),
  'utf8',
);

test('P3.13 operational reporting reads each integrated domain from its authoritative table', () => {
  assert.match(migration, /public_contact_intakes/u);
  assert.match(migration, /public_applications/u);
  assert.match(migration, /company_registrations/u);
  assert.match(migration, /finance_journals/u);
  assert.match(migration, /'p305'/u);
  assert.match(migration, /'p306'/u);
  assert.match(migration, /'p309'/u);
});

test('P3.13 removes false unintegrated labels but preserves the pending runtime boundary', () => {
  assert.doesNotMatch(migration, /P3_0[569]_NOT_INTEGRATED/u);
  assert.match(migration, /P3_10_RUNTIME_PENDING/u);
  assert.match(migration, /'state','partial'/u);
});

test('P3.13 replacement keeps authorization, audit, fixed search path, and service-only execution', () => {
  assert.match(migration, /security definer\s+set search_path = ''/u);
  assert.match(migration, /REPORT_ACCESS_DENIED/u);
  assert.match(migration, /pro_company_assignments/u);
  assert.match(migration, /customer_profiles/u);
  assert.match(migration, /access\.report\.read/u);
  assert.match(migration, /extensions\.digest\(/u);
  assert.doesNotMatch(migration, /(?<!extensions\.)digest\(/u);
  assert.match(
    migration,
    /revoke all on function public\.read_p3_12_operational_report\([^)]+\) from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_p3_12_operational_report\([^)]+\) to service_role/u,
  );
});

test('P3.13 qualifies subscription usage columns for PostgreSQL 17 replay execution', () => {
  assert.match(
    migration,
    /from public\.subscription_usage as usage\s+where usage\.snapshot_id=v_snapshot\.id\s+and usage\.allowance_key=p_allowance_key/u,
  );
  assert.doesNotMatch(
    migration,
    /from public\.subscription_usage where snapshot_id=v_snapshot\.id/u,
  );
});
