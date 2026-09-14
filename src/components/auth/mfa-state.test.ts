import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mfaFactorDiscoveryCategory,
  mfaFailureCategory,
  mfaSuccessDestination,
  sanitizeMfaCode,
} from './mfa-state';

test('MFA code sanitization keeps only the accepted bounded digits', () => {
  assert.equal(sanitizeMfaCode(' 12a34-56789 '), '12345678');
  assert.equal(sanitizeMfaCode('abc'), '');
});

test('MFA failures map to safe presentation states without server messages', () => {
  assert.equal(mfaFailureCategory('UNAUTHENTICATED'), 'sessionExpired');
  assert.equal(mfaFailureCategory('RATE_LIMITED'), 'rateLimited');
  assert.equal(mfaFailureCategory('MFA_INVALID_CODE'), 'invalidOrExpired');
  assert.equal(mfaFailureCategory('MFA_CHALLENGE_FAILED'), 'expired');
  assert.equal(mfaFailureCategory('MFA_ENROLL_REPAIR_REQUIRED'), 'repairRequired');
  assert.equal(mfaFailureCategory('MFA_ENROLL_FINALIZATION_FAILED'), 'cleanRollback');
  assert.equal(mfaFailureCategory('MFA_RECOVERY_REPAIR_REQUIRED'), 'repairRequired');
  assert.equal(mfaFailureCategory('AAL2_REQUIRED'), 'challengeRequired');
  assert.equal(mfaFailureCategory('anything-internal'), 'failure');
});

test('factor discovery calls only proven authentication absence a session expiry', () => {
  assert.equal(mfaFactorDiscoveryCategory({ status: 401 }), 'sessionExpired');
  assert.equal(mfaFactorDiscoveryCategory({ code: 'session_not_found' }), 'sessionExpired');
  assert.equal(mfaFactorDiscoveryCategory({ code: 'refresh_token_not_found' }), 'sessionExpired');
  assert.equal(mfaFactorDiscoveryCategory({ status: 503 }), 'failure');
  assert.equal(mfaFactorDiscoveryCategory(new Error('private provider failure')), 'failure');
});

test('recovery always returns to enrollment while TOTP accepts only a shared safe destination', () => {
  assert.equal(mfaSuccessDestination('recovery', '/admin'), '/login');
  assert.equal(mfaSuccessDestination('recovery', 'https://evil.example'), '/login');
  assert.equal(mfaSuccessDestination('totp', '/account'), '/account');
  assert.equal(mfaSuccessDestination('totp', 'https://evil.example'), '/');
});
