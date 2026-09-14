import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function paths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('login and registration form contracts', () => {
  const login = source('src/components/auth/LoginForm.tsx');
  const register = source('src/components/auth/RegisterForm.tsx');
  const password = source('src/components/auth/PasswordInput.tsx');
  const loginPage = source('src/app/(auth)/login/page.tsx');
  const registerPage = source('src/app/(auth)/register/page.tsx');
  const signinPage = source('src/app/(auth)/signin/page.tsx');
  const state = source('src/components/auth/auth-form-state.ts');

  it('keeps login methods truthful and recovery inside the form card', () => {
    assert.doesNotMatch(login, /role="tablist"|role="tab"|aria-selected/u);
    assert.match(login, /role="group"/u);
    assert.match(login, /mobileUnavailableDescription/u);
    assert.match(login, /href="\/forgot-password"/u);
    assert.ok(login.indexOf('href="/forgot-password"') < login.indexOf('type="submit"'));
    assert.doesNotMatch(loginPage, /href="\/forgot-password"/u);
  });

  it('preserves the login API payload and sanitizes its server destination', () => {
    assert.match(login, /postJson\('\/api\/v1\/auth\/login', values\)/u);
    assert.match(login, /loginSuccessDestination\(data\.redirectTo\)/u);
    assert.doesNotMatch(state, /queryNext === '\/mfa\/enroll'/u);
    assert.match(state, /sharedSafeDestination\(serverRedirect\)/u);
    assert.match(login, /EMAIL_NOT_VERIFIED/u);
    assert.match(login, /submissionLatch/u);
    assert.match(login, /role=\{feedback\.tone === 'error' \? 'alert' : 'status'\}/u);
    assert.match(login, /errorSummaryRef/u);
    assert.match(state, /loginFailureCategory/u);
  });

  it('collects only accepted registration fields and presents persistent requirements', () => {
    for (const field of [
      'fullName',
      'email',
      'phone',
      'password',
      'confirmPassword',
      'consentAccepted',
    ]) {
      assert.match(register, new RegExp(`name="${field}"`, 'u'));
    }
    assert.doesNotMatch(register, /name="(?:country|referral|marketingConsent)"/u);
    assert.match(register, /buildRegistrationPayload\(values\)/u);
    assert.match(register, /<PasswordRequirements/u);
    assert.match(register, /href="\/legal\/terms"/u);
    assert.match(register, /href="\/legal\/privacy"/u);
    assert.match(register, /<FormDescription/u);
    assert.doesNotMatch(register, /aria-describedby="registration-legal-copy"/u);
    assert.match(register, /submissionLatch/u);
    assert.match(register, /role=\{feedback\.tone === 'error' \? 'alert' : 'status'\}/u);
    assert.match(register, /errorSummaryRef/u);
    assert.match(state, /registrationFailureCategory/u);
  });

  it('keeps the password toggle keyboard reachable, localized, and focus preserving', () => {
    assert.doesNotMatch(password, /tabIndex=\{-1\}/u);
    assert.match(password, /type="button"/u);
    assert.match(password, /onMouseDown/u);
    assert.match(password, /preventDefault/u);
    assert.match(password, /t\('(?:hidePassword|showPassword)'\)/u);
    assert.match(password, /end-2/u);
    assert.match(register, /visually-hidden/u);
    assert.match(register, /r\.passed \? t\('requirementMet'\) : t\('requirementNotMet'\)/u);
  });

  it('gives both sign-in URLs equivalent safe metadata', () => {
    assert.match(loginPage, /generateMetadata/u);
    assert.match(signinPage, /generateMetadata/u);
  });

  it('orders providers between login submit and registration handoff', () => {
    assert.ok(loginPage.indexOf('<LoginForm') < loginPage.indexOf('<AuthProviders'));
    assert.ok(loginPage.indexOf('<AuthProviders') < loginPage.indexOf('href="/register"'));
    assert.ok(registerPage.indexOf('href="/login"') < registerPage.indexOf('<RegisterForm'));
    assert.ok(registerPage.indexOf('<RegisterForm') < registerPage.indexOf('<AuthProviders'));
  });

  it('keeps English and Arabic authentication catalog keys in parity', () => {
    assert.deepEqual(paths(en.auth).sort(), paths(ar.auth).sort());
    assert.deepEqual(paths(en.errors).sort(), paths(ar.errors).sort());
  });
});
