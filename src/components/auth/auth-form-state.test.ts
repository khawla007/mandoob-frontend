import assert from 'node:assert/strict';
import test from 'node:test';

import {
  claimAuthSubmission,
  loginFailureCategory,
  loginSuccessDestination,
  registrationFailureCategory,
  releaseAuthSubmission,
  createLoginFormSchema,
  createRegistrationFormSchema,
  buildRegistrationPayload,
  maskEmailAddress,
} from './auth-form-state';

const validation = {
  fullNameRequired: 'name',
  invalidEmail: 'email',
  invalidPhone: 'phone',
  passwordRequired: 'password',
  passwordLength: 'length',
  passwordUppercase: 'upper',
  passwordLowercase: 'lower',
  passwordSpecial: 'special',
  confirmPasswordRequired: 'confirm',
  passwordMismatch: 'mismatch',
  consentRequired: 'consent',
};

test('client schemas enforce accepted backend limits and registration payload shape', () => {
  const login = createLoginFormSchema(validation);
  assert.equal(
    login.safeParse({ email: `${'a'.repeat(250)}@x.com`, password: 'x', rememberMe: false })
      .success,
    false,
  );
  assert.equal(
    login.safeParse({ email: 'a@b.com', password: 'x'.repeat(201), rememberMe: false }).success,
    false,
  );
  const register = createRegistrationFormSchema(validation);
  const values = {
    fullName: 'A Person',
    email: 'a@b.com',
    phone: '',
    password: 'Password!',
    confirmPassword: 'Password!',
    consentAccepted: true,
  };
  assert.equal(register.safeParse(values).success, true);
  assert.deepEqual(buildRegistrationPayload(values), {
    email: 'a@b.com',
    password: 'Password!',
    confirmPassword: 'Password!',
    fullName: 'A Person',
    phone: undefined,
    consentAccepted: true,
    policyVersion: 'v1',
  });
});

test('email masking preserves handoff usability without exposing the address', () => {
  assert.equal(maskEmailAddress('person@example.com'), 'p•••••@e••••••.com');
  assert.equal(maskEmailAddress('a@b.com'), '•@•.com');
  assert.equal(maskEmailAddress('a@example.com'), '•@e••••••.com');
  assert.equal(maskEmailAddress('invalid'), '•••••••');
});

test('auth submission latch rejects a same-tick duplicate until released', () => {
  const latch = { current: false };
  assert.equal(claimAuthSubmission(latch), true);
  assert.equal(claimAuthSubmission(latch), false);
  releaseAuthSubmission(latch);
  assert.equal(claimAuthSubmission(latch), true);
});

test('login maps only accepted server codes to distinct safe categories', () => {
  assert.equal(loginFailureCategory('INVALID_INPUT'), 'validation');
  assert.equal(loginFailureCategory('INVALID_CREDENTIALS'), 'invalidCredentials');
  assert.equal(loginFailureCategory('RATE_LIMITED'), 'rateLimited');
  assert.equal(loginFailureCategory('AUTHORIZATION_UNAVAILABLE'), 'authorizationUnavailable');
  assert.equal(loginFailureCategory('CSRF_MISMATCH'), 'sessionRefreshRequired');
  assert.equal(loginFailureCategory('private internal detail'), 'unexpected');
});

test('login permits only the fixed MFA re-enrollment query handoff', () => {
  assert.equal(loginSuccessDestination('/admin'), '/admin');
  assert.equal(loginSuccessDestination('/mfa/enroll'), '/');
  assert.equal(loginSuccessDestination('https://evil.example'), '/');
});

test('registration maps duplicate, verification, security, rate and unknown codes safely', () => {
  assert.equal(registrationFailureCategory('REGISTRATION_FAILED'), 'duplicateSafe');
  assert.equal(registrationFailureCategory('EMAIL_SEND_FAILED'), 'verificationDeliveryFailed');
  assert.equal(registrationFailureCategory('TURNSTILE_FAILED'), 'humanVerificationFailed');
  assert.equal(registrationFailureCategory('CSRF_REQUIRED'), 'sessionRefreshRequired');
  assert.equal(registrationFailureCategory('RATE_LIMITED'), 'rateLimited');
  assert.equal(registrationFailureCategory('private internal detail'), 'unexpected');
});
