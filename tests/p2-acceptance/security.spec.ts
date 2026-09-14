import { expect, test } from '@playwright/test';

import {
  fixture,
  gotoAs,
  noSecretOrExistenceLeak,
  observeMutationRequests,
} from './support/tier-c';

test.describe('P2.12 Tier C authorization and safe authentication states', () => {
  test('unauthenticated dashboard request is denied without leaking fixture data', async ({
    page,
  }) => {
    const mutationAudit = observeMutationRequests(page);
    await page.goto('/admin', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login(?:\?|$)/u);
    await noSecretOrExistenceLeak(page);
    mutationAudit.assertZero();
  });

  test('wrong-role Admin route is denied to Customer without an existence leak', async ({
    browser,
  }) => {
    const { context, page, mutationAudit } = await gotoAs(browser, 'customer', '/admin/users', {
      allowDenied: true,
    });
    try {
      expect(new URL(page.url()).pathname).toBe('/login');
      await expect(page.getByRole('heading', { level: 1, name: /sign in/i })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: /users/i })).toHaveCount(0);
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/P2\.12 Local Acceptance Company|admin@p2-12\.local|Super Admin/u);
      await noSecretOrExistenceLeak(page);
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('cross-tenant request and unknown entity are non-disclosing', async ({ browser }) => {
    const denied = await gotoAs(browser, 'pro', '/t/not-the-fixture/dashboard', {
      allowDenied: true,
    });
    try {
      await noSecretOrExistenceLeak(denied.page);
      expect(await denied.page.locator('body').innerText()).not.toContain(
        'P2.12 Local Acceptance Company',
      );
    } finally {
      denied.mutationAudit.assertZero();
      await denied.context.close();
    }

    const unknown = await gotoAs(
      browser,
      'admin',
      '/admin/users/00000000-0000-4000-8000-000000000099',
      { allowDenied: true },
    );
    try {
      await noSecretOrExistenceLeak(unknown.page);
      expect(await unknown.page.locator('body').innerText()).not.toContain(
        '00000000-0000-4000-8000-000000000099',
      );
    } finally {
      unknown.mutationAudit.assertZero();
      await unknown.context.close();
    }
  });

  test('account security and sessions expose safe state without session material', async ({
    browser,
  }) => {
    for (const path of ['/account/security', '/account/sessions']) {
      const { context, page, mutationAudit } = await gotoAs(browser, 'admin', path);
      try {
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await noSecretOrExistenceLeak(page);
        expect(await page.locator('body').innerText()).not.toMatch(
          /(?:access[_ -]?token|refresh[_ -]?token|recovery code|totp secret|otpauth:\/\/)/iu,
        );
      } finally {
        mutationAudit.assertZero();
        await context.close();
      }
    }
  });

  test('MFA challenge and enrollment routes never render retained secrets for an AAL2 session', async ({
    browser,
  }) => {
    for (const path of ['/mfa/challenge', '/mfa/enroll']) {
      const { context, page, mutationAudit } = await gotoAs(browser, 'admin', path, {
        allowDenied: true,
      });
      try {
        await noSecretOrExistenceLeak(page);
        const body = await page.locator('body').innerText();
        expect(body).not.toMatch(/otpauth:\/\/|[A-Z2-7]{32,}|\b[a-z0-9_-]{5}-[a-z0-9_-]{5}\b/iu);
        expect(new URL(page.url()).origin).toBe(fixture.origin);
      } finally {
        mutationAudit.assertZero();
        await context.close();
      }
    }
  });
});
