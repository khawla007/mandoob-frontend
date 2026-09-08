import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import messages from '@/messages/en.json';
import { resolveProRegistrationState } from './pro-registration-state';

const root = process.cwd();

function source(path: string): string {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

describe('PRO registration review intake', () => {
  const page = source('src/app/(auth)/register/pro/page.tsx');
  const component = source('src/components/auth/ProRegistrationReview.tsx');
  const states = source('src/components/auth/pro-registration-state.ts');
  const css = source('src/components/auth/pro-registration-review.module.css');

  it('is a directly rendered server route with unique metadata and one H1', () => {
    assert.doesNotMatch(page, /redirect\s*\(/u);
    assert.match(page, /generateMetadata/u);
    assert.match(page, /auth\.metadata\.proRegister/u);
    assert.match(component, /<h1>/u);
    assert.equal(component.match(/<h1>/gu)?.length, 1);
    assert.doesNotMatch(component, /['"]use client['"]/u);
  });

  it('cannot submit or mutate authentication state', () => {
    const combined = `${page}\n${component}\n${states}`;
    assert.doesNotMatch(
      combined,
      /<form\b|action=|fetch\s*\(|axios|\.signUp\s*\(|\.insert\s*\(|register-pro/iu,
    );
    assert.doesNotMatch(combined, /useEffect|useActionState|useTransition/iu);
  });

  it('states verified-PRO eligibility and Mandoob policy without unsupported promises', () => {
    assert.match(page, /proReview\.eligibility\.verified/u);
    assert.match(page, /proReview\.eligibility\.company/u);
    assert.match(page, /proReview\.policyNote/u);
    assert.match(page, /proReview\.reviewNotApproval/u);
    assert.doesNotMatch(component, /team|portfolio|guaranteed approval|lead ownership/iu);
  });

  it('uses the safe Contact interest journey and labels production submission unavailable', () => {
    assert.match(component, /href="\/contact\?topic=pro-interest"/u);
    assert.match(page, /proReview\.submissionUnavailable/u);
    assert.match(page, /proReview\.contactHandoff/u);
    assert.doesNotMatch(component, /type="submit"|Create PRO|Create account/iu);
  });

  it('models every required state as no-write presentation geometry', () => {
    for (const state of [
      'ready',
      'unavailable',
      'validation',
      'pending',
      'review',
      'duplicate',
      'rate',
      'error',
      'success',
    ]) {
      assert.match(states, new RegExp(`'${state}'`, 'u'));
      assert.ok(state in messages.auth.proReview.states);
    }
    assert.match(page, /process\.env\.NODE_ENV/u);
    assert.match(page, /proReview\.presentationOnly/u);
    assert.match(component, /data-state=\{state\}/u);
    assert.match(component, /role=\{stateRole\}/u);
  });

  it('allows only exact development/test preview states and forces production unavailable', () => {
    assert.deepEqual(resolveProRegistrationState('review', 'development'), {
      state: 'review',
      presentationOnly: true,
    });
    assert.deepEqual(resolveProRegistrationState(['success', 'error'], 'test'), {
      state: 'ready',
      presentationOnly: true,
    });
    assert.deepEqual(resolveProRegistrationState('success', 'production'), {
      state: 'unavailable',
      presentationOnly: false,
    });
  });

  it('uses isolated semantic styling with dark, focus, and reduced-motion treatment', () => {
    assert.match(page, /pro-registration-review\.module\.css/u);
    assert.match(css, /var\(--public-/u);
    assert.match(css, /:global\(\.dark\)/u);
    assert.match(css, /:focus-visible/u);
    assert.match(css, /prefers-reduced-motion:\s*reduce/u);
  });
});
