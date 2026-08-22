import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/lib/data/admin-read-user.ts'), 'utf8');

test('generic PRO read uses one masked lifecycle aggregate and never reads raw credential fields', () => {
  assert.match(source, /readProCredentialSnapshot\(caller\.id, targetId\)/u);
  assert.match(source, /credentialSummary: credentialSnapshot\.credentials\[0\] \?\? null/u);
  assert.doesNotMatch(
    source,
    /license_no|credentials_verified|verified_at|verified_by_profile_id/u,
  );
  assert.doesNotMatch(source, /from\('pro_credentials'\)|decryptOptional\([^)]*licen/u);
});
