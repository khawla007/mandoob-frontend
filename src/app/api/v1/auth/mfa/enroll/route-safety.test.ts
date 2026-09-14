import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('MFA enrollment API never returns a provider diagnostic', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/api/v1/auth/mfa/enroll/route.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /error\?\.message/u);
  assert.match(source, /errorResponse\('MFA_ENROLL_FAILED', 'Could not start MFA enrollment'/u);
  assert.match(source, /authorizeMfaEnrollment/u);
  assert.match(source, /'AAL2_REQUIRED'/u);
  assert.match(source, /'MFA_ALREADY_ENROLLED'/u);
});
