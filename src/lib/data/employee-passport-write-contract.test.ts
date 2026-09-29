import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('every current employee passport writer stores or clears the keyed hash coherently', () => {
  for (const path of [
    'src/lib/data/admin-create-user.ts',
    'src/lib/data/admin-edit-user.ts',
    'src/lib/data/admin-change-role.ts',
  ]) {
    const source = read(path);
    assert.match(source, /passport_no_hash/iu, path);
    assert.match(source, /hashPassportForLookup/iu, path);
  }
  // P3.08 writers seal the ciphertext, keyed hash and last4 as one triple.
  assert.match(
    read('src/lib/employees/identifiers.ts'),
    /passport_no_hash = normalized \? deps\.hashPassport/u,
  );
  assert.match(read('src/lib/p308/server.ts'), /hashPassport: hashPassportForLookup/u);
  assert.match(
    read('src/lib/employees/import-worker-supabase.ts'),
    /hashPassport: hashPassportForLookup/u,
  );
  assert.match(read('src/lib/data/account-self.ts'), /updateEmployeeSelfPassport/iu);
  assert.doesNotMatch(
    read('src/lib/data/account-self.ts'),
    /role === 'employee'[\s\S]*?from\(['"]employees['"]\)\.update/iu,
  );
  assert.match(
    read('src/lib/data/employee-self-passport.ts'),
    /hashPassportForLookup\(scope\.companyId/iu,
  );
  assert.match(read('src/lib/data/erasure.ts'), /update\.passport_no_hash = null/iu);
  assert.match(
    read('src/lib/data/admin-create-user.ts'),
    /from\('employees'\)\.insert\(\{[\s\S]*?passport_no_encrypted:[\s\S]*?passport_no_hash:/u,
  );
  assert.match(
    read('src/lib/data/admin-edit-user.ts'),
    /else if \(input\.role === 'employee'\)[\s\S]*?passport_no_encrypted:[\s\S]*?passport_no_hash:/u,
  );
  assert.match(
    read('src/lib/data/admin-change-role.ts'),
    /else if \(input\.newRole === 'employee'\)[\s\S]*?passport_no_encrypted:[\s\S]*?passport_no_hash:/u,
  );
});

test('all direct employee mutations use the service-role boundary', () => {
  for (const path of [
    'src/lib/data/admin-create-user.ts',
    'src/lib/data/admin-edit-user.ts',
    'src/lib/data/erasure.ts',
    'src/lib/p308/server.ts',
    'src/lib/employees/import-worker-supabase.ts',
  ]) {
    const source = read(path);
    assert.match(source, /createSupabaseServiceRoleClient/iu, path);
  }
  const importActions = read('src/app/(tenant)/t/[tenant]/(pro)/imports/actions.ts');
  assert.match(
    importActions,
    /select\('id, passport_no_hash'\)[\s\S]*?\.not\('passport_no_hash', 'is', null\)/u,
  );
  assert.doesNotMatch(importActions, /select\([^)]*passport_no_encrypted/u);
});

test('employee passport unique violations map to stable safe duplicate outcomes', () => {
  for (const path of [
    'src/lib/data/admin-create-user.ts',
    'src/lib/data/admin-edit-user.ts',
    'src/lib/data/admin-change-role.ts',
    'src/lib/data/account-self.ts',
    'src/lib/p308/operation.ts',
  ]) {
    assert.match(read(path), /PASSPORT_DUPLICATE|EmployeePassportDuplicateError/iu, path);
  }
});
