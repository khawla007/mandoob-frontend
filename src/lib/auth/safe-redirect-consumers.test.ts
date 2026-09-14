import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const callbackRoute = readFileSync(
  new URL('../../app/(auth)/callback/route.ts', import.meta.url),
  'utf8',
);
const mfaChallenge = readFileSync(
  new URL('../../components/auth/MfaChallengeForm.tsx', import.meta.url),
  'utf8',
);
const mfaState = readFileSync(
  new URL('../../components/auth/mfa-state.ts', import.meta.url),
  'utf8',
);

test('callback sanitizes successful destinations through the shared policy', () => {
  assert.match(callbackRoute, /sharedSafeDestination\(url\.searchParams\.get\('next'\)\)/u);
  assert.match(callbackRoute, /NextResponse\.redirect\(trustedApplicationUrl\(destination\)\)/u);
  assert.doesNotMatch(callbackRoute, /(?:request\.nextUrl|url)\.origin/u);
});

test('callback reports missing and failed code exchanges instead of navigating as success', () => {
  assert.match(callbackRoute, /if \(!code\) return failedRedirect\(\);/u);
  assert.match(callbackRoute, /error=callback_failed/u);
  assert.match(
    callbackRoute,
    /const \{ error \} = await supabase\.auth\.exchangeCodeForSession\(code\)/u,
  );
  assert.match(callbackRoute, /if \(error\) return failedRedirect\(\);/u);
  assert.match(callbackRoute, /catch \{\s+return failedRedirect\(\);\s+\}/u);
  assert.doesNotMatch(callbackRoute, /trustedApplicationUrl\([^)]*(?:code|next)[^)]*\)/u);
});

test('MFA success uses the mode-aware safe destination policy', () => {
  assert.match(mfaChallenge, /useRouter/u);
  assert.match(mfaChallenge, /router\.replace\(mfaSuccessDestination\(mode, rawNext\)\)/u);
  assert.match(mfaState, /mode === 'recovery' \? '\/login' : sharedSafeDestination\(rawNext\)/u);
  assert.doesNotMatch(mfaChallenge, /window\.location\.href/u);
});
