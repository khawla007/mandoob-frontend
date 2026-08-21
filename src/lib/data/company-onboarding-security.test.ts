import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const protectedNames = [
  'establishment_card_no_encrypted',
  'establishment_card_no_hash',
  'iban_encrypted',
  'iban_hash',
  'account_number_encrypted',
  'account_number_hash',
];

test('onboarding data boundary exists and never exposes protected stored identifiers', () => {
  const path = join(process.cwd(), 'src/lib/data/company-onboarding.ts');
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  for (const protectedName of protectedNames) {
    assert.doesNotMatch(source, new RegExp(`['\"]${protectedName}['\"]`, 'u'));
  }
  assert.match(source, /masked/u);
});

test('mutation boundary is server-only and prepares protected values before RPC calls', () => {
  const path = join(process.cwd(), 'src/lib/data/company-onboarding-mutations.ts');
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  assert.match(source, /server-only/u);
  assert.match(source, /encryptPii/u);
  assert.match(source, /createBlindIndex/u);
  assert.match(source, /save_company_bank_section/u);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/u);
});

test('migrations never grant client roles direct protected table access', () => {
  const paths = [
    'supabase/migrations/20260821090000_0065_company_onboarding_schema.sql',
    'supabase/migrations/20260821092000_0067_company_onboarding_security_reconciliation.sql',
  ];
  const sql = paths
    .map((path) => readFileSync(join(process.cwd(), path), 'utf8'))
    .join('\n')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  const forbiddenGrants = sql
    .split(';')
    .filter(
      (statement) =>
        /grant (?:select|insert|update|delete|all)/u.test(statement) &&
        /company_bank_details/u.test(statement) &&
        /to (?:anon|authenticated|public)/u.test(statement),
    );
  assert.deepEqual(forbiddenGrants, []);
});
