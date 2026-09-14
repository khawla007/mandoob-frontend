import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

test('sensitive pages provide unique metadata and exactly one catalog-backed heading', () => {
  const pages = [
    ['invite', 'src/app/(auth)/invite/[token]/page.tsx'],
    ['otp', 'src/app/(auth)/verify-otp/page.tsx'],
    ['forgot', 'src/app/(auth)/forgot-password/page.tsx'],
    ['reset', 'src/app/(auth)/reset-password/page.tsx'],
  ] as const;
  for (const [key, file] of pages) {
    const source = read(file);
    assert.equal(source.match(/<h1\b/gu)?.length, 1, file);
    assert.match(source, new RegExp(`recovery\\.metadata\\.${key}`, 'u'), file);
    assert.doesNotMatch(source, /text-(?:zinc|red)-|bg-black|text-white/u, file);
  }
});

test('invitation blocks malformed tokens without rendering them', () => {
  const invitePage = read('src/app/(auth)/invite/[token]/page.tsx');
  const inviteForm = read('src/components/auth/InviteAcceptForm.tsx');
  assert.match(invitePage, /isAcceptedInviteToken\(token\)/u);
  assert.match(inviteForm, /tokenState !== 'ready'/u);
  assert.doesNotMatch(inviteForm, />\s*\{token\}\s*</u);
});

test('reset recovery uses the callback session rather than a second query token', () => {
  const callback = read('src/app/(auth)/callback/route.ts');
  const forgotRoute = read('src/app/api/v1/auth/forgot-password/route.ts');
  const resetPage = read('src/app/(auth)/reset-password/page.tsx');
  const resetForm = read('src/components/auth/ResetPasswordForm.tsx');
  const resetRoute = read('src/app/api/v1/auth/reset-password/route.ts');
  const schema = read('src/lib/validation/auth.ts');
  assert.match(forgotRoute, /\/callback\?next=\/reset-password/u);
  assert.match(callback, /destination === '\/reset-password'/u);
  assert.match(callback, /RECOVERY_CONTEXT_COOKIE_NAME/u);
  assert.ok(callback.indexOf('exchangeCodeForSession') < callback.indexOf('cookies.set'));
  assert.match(resetPage, /createSupabaseServerClient/u);
  assert.match(resetPage, /auth\.getUser\(\)/u);
  assert.match(resetPage, /isValidRecoveryContextValue/u);
  assert.doesNotMatch(resetPage, /searchParams|isAcceptedResetToken/u);
  assert.match(resetForm, /\{ password \}/u);
  assert.doesNotMatch(resetForm, /tokenState|\btoken\b/u);
  assert.match(resetRoute, /auth\.getUser\(\)/u);
  assert.match(resetRoute, /isValidRecoveryContextValue/u);
  assert.match(resetRoute, /claimRecoveryContext/u);
  assert.match(resetRoute, /deleteRecoveryContextCookie/u);
  assert.ok(resetRoute.indexOf('claimRecoveryContext') < resetRoute.indexOf('updateUser'));
  assert.match(resetRoute, /claimResult !== 'allowed'/u);
  assert.match(schema, /resetPasswordSchema = z\.object\(\{\s*password:/u);
  assert.doesNotMatch(schema, /resetPasswordSchema = z\.object\(\{\s*token:/u);
});

test('a claimed reset is terminal after update failure and refresh cannot offer a retry', () => {
  const resetPage = read('src/app/(auth)/reset-password/page.tsx');
  const resetForm = read('src/components/auth/ResetPasswordForm.tsx');
  const resetRoute = read('src/app/api/v1/auth/reset-password/route.ts');
  assert.match(
    resetRoute,
    /if \(updateErr\) \{[\s\S]*deleteRecoveryContextCookie\(\)[\s\S]*RESET_CONTEXT_CONSUMED/u,
  );
  assert.match(resetPage, /RECOVERY_CONTEXT_COOKIE_NAME/u);
  assert.match(resetForm, /category === 'invalidOrExpired'[\s\S]*setState\('terminal'\)/u);
  assert.match(resetForm, /state === 'terminal'[\s\S]*requestAnother/u);
});

test('post-change revocation failures return sanitized completion instead of a password retry', () => {
  const resetRoute = read('src/app/api/v1/auth/reset-password/route.ts');
  assert.match(resetRoute, /const \{ error: revokeError \} = await supabase\.auth\.signOut/u);
  assert.match(
    resetRoute,
    /if \(revokeError\)[\s\S]*password reset session revocation incomplete/u,
  );
  assert.doesNotMatch(resetRoute, /console\.error\([^\n]*revokeError/u);
  assert.ok(resetRoute.indexOf('deleteRecoveryContextCookie()') < resetRoute.lastIndexOf('jsonOk'));
  assert.match(resetRoute, /jsonOk\(\{ ok: true, requiresSignIn: true \}\)/u);
});

test('recovery cookie is host-only, HttpOnly, same-site, secure in production and short-lived', () => {
  const source = read('src/lib/auth/recovery-context.ts');
  assert.match(source, /httpOnly:\s*true/u);
  assert.match(source, /sameSite:\s*'strict'/u);
  assert.match(source, /secure:\s*process\.env\.NODE_ENV === 'production'/u);
  assert.match(source, /path:\s*'\/'/u);
  assert.doesNotMatch(source, /domain:/u);
  assert.match(source, /maxAge:\s*RECOVERY_CONTEXT_MAX_AGE_SECONDS/u);
});

test('invitation acceptance propagates authoritative metadata and compensates terminal writes', () => {
  const source = read('src/app/api/v1/auth/invite/accept/route.ts');
  assert.match(source, /app_metadata:\s*\{[\s\S]*mandoob_role:\s*invite\.role/u);
  assert.match(source, /tenant_id:\s*invite\.tenant_id/u);
  assert.match(source, /mandoob_status:\s*'active'/u);
  assert.match(source, /runAuthorizedMutation/u);
  assert.match(source, /\.is\('accepted_at', null\)/u);
  assert.match(source, /\.select\('id'\)/u);
  assert.match(source, /finalized\?\.length !== 1/u);
  assert.doesNotMatch(source, /accepted_at:\s*null/u);
  assert.match(source, /acceptUpdateError/u);
  assert.match(source, /signInError/u);
  assert.ok(source.indexOf("mandoob_status: 'disabled'") < source.indexOf('.delete()'));
  assert.ok(source.indexOf('.delete()') < source.indexOf('deleteUser(userId)'));
  assert.match(source, /invite compensation incomplete/u);
  assert.doesNotMatch(source, /Promise\.allSettled/u);
});

test('invite and reset APIs never serialize provider or database error messages', () => {
  const invite = read('src/app/api/v1/auth/invite/accept/route.ts');
  const reset = read('src/app/api/v1/auth/reset-password/route.ts');
  assert.doesNotMatch(invite, /createErr\?\.message|profileErr\.message/u);
  assert.doesNotMatch(reset, /reason:\s*updateErr\.message/u);
  assert.match(invite, /errorResponse\('ACCEPT_FAILED', '[^']+'/u);
  assert.match(reset, /errorResponse\(\s*'RESET_CONTEXT_CONSUMED'/u);
});

test('OTP provides one grouped six-digit input with paste, deletion, focus and restrained status', () => {
  const source = read('src/components/auth/OtpForm.tsx');
  assert.match(source, /role="group"/u);
  assert.match(source, /onPaste=/u);
  assert.match(source, /Backspace/u);
  assert.match(source, /ArrowLeft/u);
  assert.match(source, /autoComplete="one-time-code"/u);
  assert.equal(source.match(/aria-live=/gu)?.length, 1);
  assert.match(source, /claimAuthSubmission/u);
  assert.match(source, /claimAuthSubmission\(operationLatch\)/u);
  assert.match(source, /releaseAuthSubmission\(operationLatch\)/u);
});

test('forgot and reset forms use localized validation, noValidate and accepted payload keys', () => {
  const forgot = read('src/components/auth/ForgotPasswordForm.tsx');
  const reset = read('src/components/auth/ResetPasswordForm.tsx');
  assert.match(forgot, /noValidate/u);
  assert.match(forgot, /validation\.invalidEmail/u);
  assert.match(forgot, /showFailure\(t\('validation\.invalidEmail'\), 'validation'\)/u);
  assert.match(forgot, /claimAuthSubmission/u);
  assert.match(forgot, /\{ email: normalizedEmail \}/u);
  assert.match(reset, /noValidate/u);
  assert.match(reset, /autoComplete="new-password"/u);
  assert.match(reset, /confirmPassword/u);
  assert.match(reset, /claimAuthSubmission/u);
  assert.match(reset, /\{ password \}/u);
});

test('recovery copy exists in English with exact Arabic fallback key parity', () => {
  const en = JSON.parse(read('src/messages/en.json')).auth.recovery;
  const ar = JSON.parse(read('src/messages/ar.json')).auth.recovery;
  const keys = (value: unknown, prefix = ''): string[] => {
    if (!value || typeof value !== 'object') return [prefix];
    return Object.entries(value).flatMap(([key, child]) =>
      keys(child, prefix ? `${prefix}.${key}` : key),
    );
  };
  assert.deepEqual(keys(ar).sort(), keys(en).sort());
  assert.match(en.forgot.completion, /if an account exists/i);
  assert.doesNotMatch(JSON.stringify(en), /tenant|company assignment|raw token/i);
});
