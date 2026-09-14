import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('MFA enrollment starts only from an explicit interaction and supports cleanup', () => {
  const source = read('src/components/auth/MfaEnrollCard.tsx');
  assert.doesNotMatch(source, /useEffect/u, 'enrollment must not mutate during mount');
  assert.match(source, /onStart/u);
  assert.match(source, /postJson\('\/api\/v1\/auth\/mfa\/enroll'/u);
  assert.match(source, /unenroll\(\{\s*factorId:/u);
  assert.match(source, /navigator\.clipboard\.writeText/u);
  assert.match(source, /type="checkbox"/u);
  assert.match(source, /aria-live="polite"/u);
});

test('MFA enrollment route cleans abandoned factors, sanitizes failures, and audits only verification', () => {
  const enrollRoute = read('src/app/api/v1/auth/mfa/enroll/route.ts');
  const verifyRoute = read('src/app/api/v1/auth/mfa/verify/route.ts');
  const enrollCard = read('src/components/auth/MfaEnrollCard.tsx');
  assert.match(enrollRoute, /cleanupUnverifiedTotpFactors/u);
  assert.match(enrollRoute, /getAuthenticatorAssuranceLevel/u);
  assert.match(enrollRoute, /runAuthorizedMfaEnrollmentMutation/u);
  assert.ok(
    enrollRoute.indexOf('cleanupUnverifiedTotpFactors') < enrollRoute.indexOf('.auth.mfa.enroll'),
  );
  assert.doesNotMatch(enrollRoute, /error\?\.message|recordAuthEvent/u);
  assert.doesNotMatch(verifyRoute, /chErr\?\.message|vErr\?\.message/u);
  assert.match(verifyRoute, /kind:\s*'mfa_enrolled'/u);
  assert.match(verifyRoute, /MFA_ENROLL_REPAIR_REQUIRED/u);
  assert.match(verifyRoute, /deleteMfaFactorForUser/u);
  assert.match(verifyRoute, /revokeSessions:\s*revokeAllSessions/u);
  assert.match(verifyRoute, /getAuthenticatorAssuranceLevel/u);
  assert.match(verifyRoute, /runAuthorizedMfaEnrollmentMutation/u);
  assert.match(verifyRoute, /runVerifiedMfaChallengeMutation/u);
  assert.match(verifyRoute, /MFA_INVALID_FACTOR/u);
  assert.match(enrollCard, /MFA_ENROLL_REPAIR_REQUIRED/u);
  assert.match(enrollCard, /href="\/contact"/u);
});

test('MFA challenge discovers factors and offers the accepted masked recovery flow', () => {
  const source = read('src/components/auth/MfaChallengeForm.tsx');
  const page = read('src/app/(auth)/mfa/challenge/page.tsx');
  assert.match(page, /requireUser\(\)/u);
  assert.match(page, /listFactors\(\)/u);
  assert.match(page, /status === 'verified'/u);
  assert.match(page, /initialFactorId=\{factorId\}/u);
  assert.match(page, /mfaFactorDiscoveryCategory\(factorError\)/u);
  assert.match(source, /\/api\/v1\/auth\/mfa\/recovery/u);
  assert.match(source, /mode === 'recovery' \? 'password' : 'text'/u);
  assert.match(source, /mfaSuccessDestination\(mode, rawNext\)/u);
  assert.match(source, /href="\/login"/u);
  assert.doesNotMatch(source, /data\?\.error/u, 'server error messages must not be rendered');
});

test('MFA recovery uses an atomic claim and resets factors before a fixed re-enrollment response', () => {
  const mfa = read('src/lib/auth/mfa.ts');
  const recoveryRoute = read('src/app/api/v1/auth/mfa/recovery/route.ts');
  assert.match(mfa, /\.eq\('id', id\)\s*\.is\('used_at', null\)\s*\.select\('id'\)/u);
  assert.match(recoveryRoute, /resetMfaForRecovery/u);
  assert.match(recoveryRoute, /redirectTo:\s*'\/login'/u);
  assert.match(recoveryRoute, /MFA_RECOVERY_REPAIR_REQUIRED/u);
  assert.ok(
    recoveryRoute.indexOf('redeemRecoveryCode') < recoveryRoute.indexOf('resetMfaForRecovery'),
  );
});

test('MFA auth events do not record factor identifiers or recovery secrets', () => {
  const enrollRoute = read('src/app/api/v1/auth/mfa/enroll/route.ts');
  const verifyRoute = read('src/app/api/v1/auth/mfa/verify/route.ts');
  const recoveryRoute = read('src/app/api/v1/auth/mfa/recovery/route.ts');
  assert.doesNotMatch(enrollRoute, /details:\s*\{\s*factorId/u);
  assert.doesNotMatch(verifyRoute, /details:\s*\{[^}]*factorId/u);
  assert.doesNotMatch(recoveryRoute, /details:\s*\{[^}]*parsed\.data\.code/u);
});

test('MFA copy exists in English with exact Arabic fallback key parity', () => {
  const en = JSON.parse(read('src/messages/en.json')).auth.mfa;
  const ar = JSON.parse(read('src/messages/ar.json')).auth.mfa;
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
  assert.deepEqual(ar, en);
});
