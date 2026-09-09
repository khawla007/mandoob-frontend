import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('MFA enrollment page detects an existing verified factor before rendering the client action', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/(auth)/mfa/enroll/page.tsx'), 'utf8');
  assert.match(source, /createSupabaseServerClient/u);
  assert.match(source, /requireUser/u);
  assert.ok(source.indexOf('requireUser()') < source.indexOf('listFactors()'));
  assert.match(source, /listFactors\(\)/u);
  assert.match(source, /factorError/u);
  assert.match(source, /enrollmentUnavailable=\{enrollmentUnavailable\}/u);
  assert.match(source, /factor\.status === 'verified'/u);
  assert.match(source, /challengeRequired=\{challengeRequired\}/u);
});

test('MFA enrollment page gives truthful instructions before a QR code exists', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/(auth)/mfa/enroll/page.tsx'), 'utf8');
  assert.match(source, /t\('mfaEnrollmentIntro'\)/u);
  assert.doesNotMatch(source, /t\('longCopy\.scanQrIntro'\)/u);
});
