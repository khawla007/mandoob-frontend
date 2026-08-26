import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/lib/data/admin-edit-user.ts'), 'utf8');

test('generic PRO edit mutates non-credential profile fields only', () => {
  assert.match(
    source,
    /input\.role === 'pro'[\s\S]*designation:[\s\S]*department:[\s\S]*service_areas:[\s\S]*bio:/u,
  );
  assert.doesNotMatch(
    source,
    /license_no|credentials_verified|verified_at|verified_by_profile_id|decrypt/u,
  );
});
