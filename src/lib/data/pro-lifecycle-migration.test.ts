import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPaths = [
  'supabase/migrations/20260821100000_0068_pro_lifecycle_schema.sql',
  'supabase/migrations/20260821101000_0069_pro_lifecycle_workflows.sql',
  'supabase/migrations/20260821102000_0070_pro_lifecycle_security_reconciliation.sql',
] as const;

function migration(index: number): string {
  return readFileSync(join(process.cwd(), migrationPaths[index]!), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

test('Step 3 uses the exact forward-only migration catalog', () => {
  assert.deepEqual(migrationPaths, [
    'supabase/migrations/20260821100000_0068_pro_lifecycle_schema.sql',
    'supabase/migrations/20260821101000_0069_pro_lifecycle_workflows.sql',
    'supabase/migrations/20260821102000_0070_pro_lifecycle_security_reconciliation.sql',
  ]);
  assert.equal(existsSync(join(process.cwd(), migrationPaths[0])), true, migrationPaths[0]);
});

test('0068 defines normalized lifecycle, evidence, decision, receipt, term, and link tables', () => {
  const sql = migration(0);
  for (const table of [
    'pro_credentials',
    'pro_credential_evidence',
    'pro_credential_decisions',
    'pro_lifecycle_operation_receipts',
    'pro_commercial_terms',
    'pro_commercial_term_events',
    'pro_assignment_term_links',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, 'u'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table}`, 'u'));
  }
  for (const state of [
    'draft',
    'submitted',
    'under_review',
    'verified',
    'rejected',
    'expired',
    'revoked',
  ]) {
    assert.match(sql, new RegExp(`'${state}'`, 'u'));
  }
  assert.match(sql, /where state in \('draft', 'submitted', 'under_review'\)/u);
  assert.match(sql, /where state = 'verified'/u);
  assert.match(sql, /exclude using gist/u);
  assert.match(sql, /foreign key \(pro_profile_id, credential_id\)/u);
  assert.match(sql, /legacy_unmasked/u);
  assert.match(sql, /license_no_encrypted/u);
  const identifierShape = sql.slice(
    sql.indexOf('constraint pro_credentials_identifier_shape'),
    sql.indexOf('constraint pro_credentials_authority_shape'),
  );
  assert.match(identifierShape, /legacy_unmasked/u);
  assert.match(identifierShape, /identifier_ciphertext is not null/u);
  assert.match(identifierShape, /identifier_hash is null/u);
  assert.match(identifierShape, /identifier_last4 is null/u);
  assert.match(sql, /identifier_hash is null/u);
  assert.match(sql, /identifier_last4 is null/u);
});
