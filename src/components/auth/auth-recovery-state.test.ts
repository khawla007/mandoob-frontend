import assert from 'node:assert/strict';
import test from 'node:test';

import {
  forgotPasswordFailureCategory,
  inviteFailureCategory,
  isAcceptedEmailContext,
  isAcceptedInviteToken,
  otpFailureCategory,
  resetPasswordFailureCategory,
  sanitizeOtpDigits,
  validateNewPassword,
} from './auth-recovery-state';

test('invitation token gate accepts only the issued base64url shape', () => {
  assert.equal(isAcceptedInviteToken('a'.repeat(43)), true);
  assert.equal(isAcceptedInviteToken('A0_-'.repeat(10) + 'A0_'), true);
  for (const token of ['', 'short-token', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(42) + '/']) {
    assert.equal(isAcceptedInviteToken(token), false, token);
  }
});

test('invitation maps only accepted public codes and never internal messages', () => {
  assert.equal(inviteFailureCategory('INVALID_INPUT'), 'validation');
  assert.equal(inviteFailureCategory('INVITE_INVALID'), 'invalid');
  assert.equal(inviteFailureCategory('INVITE_EXPIRED'), 'expired');
  assert.equal(inviteFailureCategory('RATE_LIMITED'), 'rateLimited');
  assert.equal(inviteFailureCategory('CSRF_MISMATCH'), 'sessionRefreshRequired');
  assert.equal(inviteFailureCategory('ACCEPT_FAILED'), 'failure');
  assert.equal(inviteFailureCategory('tenant=secret role=pro'), 'failure');
});

test('OTP normalization handles multi-digit paste and accepted safe error categories', () => {
  assert.equal(isAcceptedEmailContext('person@example.com'), true);
  assert.equal(isAcceptedEmailContext('not-an-email'), false);
  assert.equal(isAcceptedEmailContext(`${'a'.repeat(250)}@x.com`), false);
  assert.equal(sanitizeOtpDigits(' 12a3-4567 '), '123456');
  assert.equal(otpFailureCategory('INVALID_INPUT'), 'incomplete');
  assert.equal(otpFailureCategory('INVALID_OTP'), 'invalidOrExpired');
  assert.equal(otpFailureCategory('RATE_LIMITED'), 'rateLimited');
  assert.equal(otpFailureCategory('FORBIDDEN'), 'locked');
  assert.equal(otpFailureCategory('private provider detail'), 'failure');
});

test('recovery password validation matches the accepted password contract', () => {
  assert.deepEqual(validateNewPassword('Password!'), []);
  assert.deepEqual(validateNewPassword('password!'), ['lengthOrPolicy']);
  assert.deepEqual(validateNewPassword('P'.repeat(201) + 'a!'), ['lengthOrPolicy']);
});

test('forgot password preserves anti-enumeration while separating retryable failures', () => {
  assert.equal(forgotPasswordFailureCategory('INVALID_INPUT'), 'validation');
  assert.equal(forgotPasswordFailureCategory('RATE_LIMITED'), 'rateLimited');
  assert.equal(forgotPasswordFailureCategory('CSRF_REQUIRED'), 'sessionRefreshRequired');
  assert.equal(forgotPasswordFailureCategory(undefined), 'transport');
});

test('reset failures expose no internal reason', () => {
  assert.equal(resetPasswordFailureCategory('INVALID_INPUT'), 'validation');
  assert.equal(resetPasswordFailureCategory('UNAUTHENTICATED'), 'invalidOrExpired');
  assert.equal(resetPasswordFailureCategory('RESET_CONTEXT_CONSUMED'), 'invalidOrExpired');
  assert.equal(resetPasswordFailureCategory('RATE_LIMITED'), 'rateLimited');
  assert.equal(resetPasswordFailureCategory('RESET_FAILED'), 'failure');
  assert.equal(resetPasswordFailureCategory('database detail'), 'failure');
});
