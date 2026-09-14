import { expect, type Locator, type Page, type Response } from '@playwright/test';

import type { P112TierBTarget } from './tier-b';
import { totpAt, type RuntimeSecrets, type SecretStore } from './secrets';

async function settleInteractivePage(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  // Hydration effects can start WebGL textures and other local assets after the
  // initial network-idle point. Do not navigate away until those requests settle.
  await page.waitForLoadState('networkidle');
  if (new URL(page.url()).pathname === '/') {
    await page.waitForFunction(() =>
      performance
        .getEntriesByName(new URL('/images/cta-mashrabiya.png', location.origin).href)
        .some((entry) => (entry as PerformanceResourceTiming).responseEnd > 0),
    );
  }
}

async function settleReactUpdate(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function clearInputForRetainedPrivacy(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '');
    input.defaultValue = '';
    input.removeAttribute('value');
  });
}

async function exerciseHomepageInteractions(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await settleInteractivePage(page);

  const carousel = page.locator('[aria-roledescription="carousel"]');
  await expect(carousel).toBeVisible();
  const status = carousel.locator('[aria-live="polite"]');
  const initialStatus = await status.textContent();
  await carousel.getByRole('button', { name: /next/iu }).click();
  await expect(status).not.toHaveText(initialStatus ?? '');
  await carousel.getByRole('button', { name: /previous/iu }).click();
  await expect(status).toHaveText(initialStatus ?? '');

  const disclosure = page.locator('.home-faq__trigger').first();
  await disclosure.focus();
  await disclosure.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`#${await disclosure.getAttribute('aria-controls')}`)).toHaveAttribute(
    'aria-hidden',
    'false',
  );
  await disclosure.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(disclosure).toBeFocused();
}

async function prepareContact(page: Page, unavailable: boolean): Promise<void> {
  if (!unavailable) {
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('#contact-error-summary')).toBeFocused();
    return;
  }
  await page.locator('#contact-fullName').fill('Fixture');
  await page.locator('#contact-email').fill('preview@example.invalid');
  await page.locator('#contact-phone').fill('0500000000');
  await page.locator('#contact-subject').selectOption('company_setup');
  await page.locator('#contact-message').fill('Please prepare this local acceptance preview only.');
  await page.locator('#contact-consent').check();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('[data-contact-result="unavailable"]')).toBeFocused();
  await clearInputForRetainedPrivacy(page, '#contact-email');
}

async function prepareEstimatorResult(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Next step/u }).click();
  await expect(page.locator('#estimate-jurisdiction-error')).not.toBeEmpty();
  await expect(page.locator('#estimate-jurisdiction')).toBeFocused();
  for (let step = 1; step <= 8; step += 1) {
    const panel = page
      .locator('.estimator-step-panel')
      .filter({ has: page.locator(`#estimate-step-${step}-heading`) });
    await expect(panel.locator(`#estimate-step-${step}-heading`)).toBeVisible();
    let choice: Locator | null = null;
    if (step === 1) choice = panel.locator('input[value="free_zone"]');
    if ([2, 3, 4, 7].includes(step)) choice = panel.locator('input[type="radio"]').first();
    if (choice) {
      await choice.check();
      await expect(choice.locator('..')).toHaveAttribute('data-selected', 'true');
    }
    if (step === 5) await panel.locator('input[type="number"]').fill('1');
    if (step === 6) await panel.locator('input[type="number"]').fill('0');
    await settleReactUpdate(page);
    await panel.getByRole('button', { name: /Next step/u }).click();
    await expect(
      page
        .locator('.estimator-step-panel[data-step-state="current"]')
        .locator(`#estimate-step-${step + 1}-heading`),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: 'Calculate indicative estimate' }).click();
  await expect(page.locator('.estimator-result')).toBeVisible();
  await expect(page.locator('#estimate-result-heading')).toBeFocused();

  await page.getByRole('button', { name: 'Save locally' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  expect(
    await page.evaluate(() => window.localStorage.getItem('mandoob.estimator.draft')),
  ).not.toBeNull();

  await page.getByRole('button', { name: 'Reset' }).click();
  const resetDialog = page.getByRole('dialog', { name: 'Reset this estimator?' });
  await expect(resetDialog).toBeVisible();
  await resetDialog.press('Escape');
  await expect(resetDialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reset' })).toBeFocused();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('#estimate-step-1-heading')).toBeVisible();
  await expect(page.locator('#estimate-jurisdiction')).toBeFocused();
  await page
    .getByRole('navigation', { name: 'Estimator steps' })
    .getByRole('button', { name: /Summary/u })
    .click();
  await page.getByRole('button', { name: 'Calculate indicative estimate' }).click();
  await expect(page.locator('.estimator-result')).toBeVisible();
  await expect(page.locator('#estimate-result-heading')).toBeFocused();
}

async function advanceApplicationToSetup(page: Page): Promise<void> {
  await page.locator('#application-full-name').fill('Fixture');
  await page.locator('#application-nationality').fill('Testland');
  await page.locator('#application-phone').fill('0500000000');
  await page.getByRole('button', { name: /Continue/u }).click();
  await page.locator('#application-activity').selectOption({ index: 1 });
  await page.locator('#application-company-name-1').fill('P112 Preview');
  await page
    .locator('#application-business-summary')
    .fill('Synthetic local company setup preview for accessibility acceptance.');
  await page.getByRole('button', { name: /Continue/u }).click();
  await expect(page.locator('.application-setup')).toBeVisible();
}

async function advanceApplicationToReview(page: Page): Promise<void> {
  await advanceApplicationToSetup(page);
  await page.locator('#application-jurisdiction').selectOption({ index: 1 });
  await page.getByRole('button', { name: /Continue/u }).click();
  await page.locator('#application-authority').selectOption({ index: 1 });
  await page.locator('#application-legal-structure').selectOption({ index: 1 });
  await page.getByRole('button', { name: /Continue/u }).click();
  await page.getByRole('radio', { name: 'No' }).check();
  await page.getByRole('button', { name: /Continue/u }).click();
  await page.locator('#application-office-type').selectOption({ index: 1 });
  await page.getByRole('button', { name: /Continue/u }).click();
  await page.getByRole('button', { name: /Continue/u }).click();
  await page.locator('#application-shareholder-count').fill('1');
  await page.locator('[id$="-full-name"]').last().fill('Fixture');
  await page.locator('[id$="-nationality"]').last().fill('Testland');
  const ownership = page.locator('[id$="-ownership"]').last();
  await ownership.fill('100');
  await ownership.blur();
  await page.getByRole('button', { name: /Continue/u }).click();
  await expect(page.locator('.application-review')).toBeVisible();
}

async function prepareApplication(page: Page, targetId: string): Promise<void> {
  if (targetId === 'application-setup') {
    await advanceApplicationToSetup(page);
    return;
  }
  await advanceApplicationToReview(page);
  if (targetId === 'application-review') return;
  await page.locator('#application-information-confirmation input').check();
  await page.locator('#application-data-consent input').check();
  await page.getByRole('button', { name: 'Complete local preview' }).click();
  if (targetId === 'application-confirmed') {
    await expect(page.locator('.application-confirmation')).toBeVisible();
  } else {
    await expect(page.locator('.application-outcome[role="alert"]')).toBeVisible();
  }
}

async function prepareLogin(
  page: Page,
  withProviderError: boolean,
  fixture?: RuntimeSecrets,
): Promise<void> {
  if (!withProviderError) {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('form [role="alert"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeFocused();
    return;
  }
  const email = page.locator('input[type="email"]');
  if (!fixture) throw new Error('P1.12 login error requires fixture credentials');
  await email.fill(fixture.email);
  await page.locator('input[type="password"]').fill('NotTheFixture1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('form [role="alert"]')).toBeFocused();
  await clearInputForRetainedPrivacy(page, 'input[type="email"]');
  await clearInputForRetainedPrivacy(page, 'input[type="password"]');
}

async function loginFixture(
  page: Page,
  fixture: RuntimeSecrets,
  nextPath: '/mfa/enroll' | '/mfa/challenge' = '/mfa/enroll',
): Promise<Response | null> {
  const loginPath = `/login?next=${encodeURIComponent(nextPath)}`;
  if (
    new URL(page.url()).pathname !== '/login' ||
    new URL(page.url()).search !== `?next=${encodeURIComponent(nextPath)}`
  ) {
    await page.goto(loginPath, { waitUntil: 'domcontentloaded' });
    await settleInteractivePage(page);
  }
  await page.locator('input[type="email"]').fill(fixture.email);
  await page.locator('input[type="password"]').fill(fixture.password);
  const login = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/v1/auth/login',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect((await login).status()).toBe(200);
  await page.waitForURL((url) => url.pathname === '/');
  await settleInteractivePage(page);
  const retainedResponse = await page.goto(nextPath, { waitUntil: 'domcontentloaded' });
  await settleInteractivePage(page);
  return retainedResponse;
}

async function completeMfaEnrollment(
  page: Page,
  fixture: RuntimeSecrets,
  secrets: SecretStore,
  retainAsChallengeFactor: boolean,
): Promise<string> {
  await page.goto('/mfa/enroll', { waitUntil: 'domcontentloaded' });
  await settleInteractivePage(page);
  await page.getByRole('button', { name: 'Start setup' }).click();
  await expect(page.locator('[data-auth-state="setup"]')).toBeVisible();
  const secret = (await page.locator('details code').textContent())?.trim();
  if (!secret) throw new Error('P1.12 MFA setup secret unavailable');
  await page.locator('#mfa-enroll-code').fill(totpAt(secret));
  const verification = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/v1/auth/mfa/verify',
  );
  await page.getByRole('button', { name: 'Verify and enable' }).click();
  expect((await verification).status()).toBe(200);
  await expect(page.locator('[data-auth-state="recovery"]')).toBeVisible();
  if (retainAsChallengeFactor) {
    fixture.totpSecret = secret;
    await secrets.save(fixture);
  }
  return secret;
}

async function discoverVerifiedFactor(page: Page): Promise<{
  factorId: string;
  authorization: string;
  apiKey: string;
}> {
  const discovery = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'GET' &&
      candidate.url().startsWith('http://127.0.0.1:56321/auth/v1/user'),
  );
  await page.goto('/mfa/challenge', { waitUntil: 'domcontentloaded' });
  await settleInteractivePage(page);
  await expect(page.locator('[data-auth-state="ready"]')).toBeVisible();
  const response = await discovery;
  const data = (await response.json()) as {
    factors?: Array<{ id?: unknown; factor_type?: unknown; status?: unknown }>;
  };
  const factor = data.factors?.find(
    (candidate) => candidate.factor_type === 'totp' && candidate.status === 'verified',
  );
  const headers = response.request().headers();
  if (
    typeof factor?.id !== 'string' ||
    typeof headers.authorization !== 'string' ||
    typeof headers.apikey !== 'string'
  ) {
    throw new Error('P1.12 verified MFA factor discovery incomplete');
  }
  return {
    factorId: factor.id,
    authorization: headers.authorization,
    apiKey: headers.apikey,
  };
}

async function removeVerifiedFactor(
  page: Page,
  factor: Awaited<ReturnType<typeof discoverVerifiedFactor>>,
  authorizeFixtureFactor: (factorId: string) => void,
): Promise<void> {
  authorizeFixtureFactor(factor.factorId);
  const status = await page.evaluate(async ({ factorId, authorization, apiKey }) => {
    const response = await fetch(
      `http://127.0.0.1:56321/auth/v1/factors/${encodeURIComponent(factorId)}`,
      { method: 'DELETE', headers: { authorization, apikey: apiKey } },
    );
    await response.text();
    return response.status;
  }, factor);
  expect(status).toBe(200);
}

async function prepareInvalidMfaChallenge(
  page: Page,
  fixture: RuntimeSecrets,
  secrets: SecretStore,
): Promise<Response | null> {
  let challengeSecret = fixture.totpSecret;
  if (!challengeSecret) {
    await loginFixture(page, fixture);
    challengeSecret = await completeMfaEnrollment(page, fixture, secrets, true);
  }
  const retainedResponse = await loginFixture(page, fixture, '/mfa/challenge');
  await expect(page.locator('[data-auth-state="ready"]')).toBeVisible();
  const validCode = totpAt(challengeSecret);
  const invalidCode = validCode === '000000' ? '000001' : '000000';
  await page.locator('#mfa-challenge-code').fill(invalidCode);
  const verification = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/v1/auth/mfa/verify',
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  expect((await verification).status()).toBe(401);
  await expect(page.locator('[data-auth-state="failure"] [role="alert"]')).toBeVisible();
  await clearInputForRetainedPrivacy(page, '#mfa-challenge-code');
  return retainedResponse;
}

async function prepareCompletedMfaEnrollment(
  page: Page,
  fixture: RuntimeSecrets,
  secrets: SecretStore,
  authorizeFixtureFactor: (factorId: string) => void,
): Promise<Response | null> {
  let challengeSecret = fixture.totpSecret;
  if (!challengeSecret) {
    await loginFixture(page, fixture);
    challengeSecret = await completeMfaEnrollment(page, fixture, secrets, true);
  }
  await loginFixture(page, fixture, '/mfa/challenge');
  await page.goto('/mfa/challenge', { waitUntil: 'domcontentloaded' });
  await settleInteractivePage(page);
  await expect(page.locator('[data-auth-state="ready"]')).toBeVisible();
  await page.locator('#mfa-challenge-code').fill(totpAt(challengeSecret));
  const challenge = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/v1/auth/mfa/verify',
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  expect((await challenge).status()).toBe(200);
  await page.waitForURL((url) => url.pathname === '/');
  const factor = await discoverVerifiedFactor(page);
  await removeVerifiedFactor(page, factor, authorizeFixtureFactor);
  await completeMfaEnrollment(page, fixture, secrets, true);
  await page.getByRole('checkbox', { name: /saved these recovery codes/u }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.locator('.hero')).toBeVisible();
  await settleInteractivePage(page);
  const retainedResponse = await page.reload({ waitUntil: 'domcontentloaded' });
  await settleInteractivePage(page);
  await expect(page.locator('.hero')).toBeVisible();
  return retainedResponse;
}

export async function prepareP112TierCState(
  page: Page,
  target: P112TierBTarget,
  fixture?: RuntimeSecrets,
  secrets?: SecretStore,
  authorizeFixtureFactor?: (factorId: string) => void,
): Promise<Response | null> {
  const initialRoute = target.id.startsWith('mfa-') ? '/login' : target.route;
  let retainedResponse = await page.goto(initialRoute, { waitUntil: 'domcontentloaded' });
  await settleInteractivePage(page);
  switch (target.id) {
    case 'free-zones-no-results':
      await exerciseHomepageInteractions(page);
      await page.goto(target.route, { waitUntil: 'domcontentloaded' });
      await settleInteractivePage(page);
      await page.getByRole('searchbox', { name: 'Search by name' }).fill('p1-12-no-match');
      await page.getByRole('button', { name: 'Apply filters' }).click();
      await expect(page.locator('.setup-directory__empty')).toBeVisible();
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await expect(page.locator('.setup-directory__empty')).toBeHidden();
      await page.getByRole('searchbox', { name: 'Search by name' }).fill('p1-12-no-match');
      await page.getByRole('button', { name: 'Apply filters' }).click();
      await expect(page.locator('.setup-directory__empty')).toBeVisible();
      break;
    case 'contact-validation':
      await prepareContact(page, false);
      break;
    case 'contact-unavailable':
      await prepareContact(page, true);
      break;
    case 'estimator-result':
      await prepareEstimatorResult(page);
      break;
    case 'application-setup':
    case 'application-review':
    case 'application-confirmed':
    case 'application-unavailable':
      await prepareApplication(page, target.id);
      break;
    case 'login-validation':
      await prepareLogin(page, false);
      break;
    case 'login-error':
      await prepareLogin(page, true, fixture);
      break;
    case 'register-validation':
      await page.getByRole('button', { name: 'Create an account' }).click();
      await expect(page.locator('form [role="alert"]')).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Full name' })).toBeFocused();
      break;
    case 'generic-cms-ready':
      await expect(page.locator('.cms-editorial-hero')).toBeVisible();
      break;
    case 'mfa-enroll-initial':
      if (!fixture) throw new Error('P1.12 MFA enrollment requires fixture credentials');
      retainedResponse = await loginFixture(page, fixture);
      await expect(page.locator('[data-auth-state="ready"]')).toBeVisible();
      break;
    case 'mfa-challenge-invalid':
      if (!fixture || !secrets) throw new Error('P1.12 MFA challenge requires fixture credentials');
      retainedResponse = await prepareInvalidMfaChallenge(page, fixture, secrets);
      break;
    case 'mfa-enroll-complete':
      if (!fixture || !secrets || !authorizeFixtureFactor)
        throw new Error('P1.12 MFA completion requires fixture credentials');
      retainedResponse = await prepareCompletedMfaEnrollment(
        page,
        fixture,
        secrets,
        authorizeFixtureFactor,
      );
      break;
    default:
      throw new Error(`P1.12 Tier C state preparation is not implemented: ${target.id}`);
  }
  await page.evaluate(() => history.replaceState(null, '', location.pathname + location.search));
  return retainedResponse;
}
