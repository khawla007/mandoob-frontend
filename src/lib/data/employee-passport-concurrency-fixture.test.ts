import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (name: string) =>
  readFileSync(join(process.cwd(), 'supabase/tests', name), 'utf8').toLowerCase();

test('two-session passport fixture proves the company-scoped unique index conflict', () => {
  const sessionA = read('employee_passport_uniqueness_session_a.sql');
  const sessionB = read('employee_passport_uniqueness_session_b.sql');
  const combined = `${sessionA}\n${sessionB}`;

  assert.match(
    sessionA,
    /delete from public\.employees[\s\S]*id in \([\s\S]*63000000-0000-4000-8000-000000000001[\s\S]*63000000-0000-4000-8000-000000000002[\s\S]*tenant_id = :'tenant_id'::uuid[\s\S]*company_id = :'company_id'::uuid[\s\S]*begin;/u,
  );
  assert.match(
    sessionA,
    /begin;[\s\S]*insert into public\.employees[\s\S]*pg_sleep[\s\S]*commit;/u,
  );
  assert.match(sessionB, /insert into public\.employees[\s\S]*unique_violation/u);
  assert.match(sessionB, /returned_sqlstate[\s\S]*23505/u);
  assert.match(sessionB, /constraint_name[\s\S]*employee_company_passport_hash_unique/u);
  assert.match(
    sessionB,
    /v_constraint_name <> 'employee_company_passport_hash_unique'[\s\S]*raise exception/u,
  );
  assert.match(sessionB, /count\(\*\) = 1[\s\S]*company_id[\s\S]*passport_no_hash/u);
  assert.match(combined, /:'tenant_id'::uuid/u);
  assert.match(combined, /:'company_id'::uuid/u);
  assert.match(combined, /'a' \|\| repeat\('0', 63\)/u);
});
