import { expect, test } from '@playwright/test';

import {
  assertFocusContained,
  assertNoExternalRequests,
  fixture,
  gotoAs,
  recordMutationRequests,
} from './support/tier-c';

test.describe('P2.12 Tier C interaction journeys', () => {
  test('shell skip link, navigation, account menu Escape, and focus restoration', async ({
    browser,
  }) => {
    const { context, page, mutationAudit } = await gotoAs(browser, 'admin', '/admin');
    const external = assertNoExternalRequests(page);
    try {
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Skip to content' });
      await expect(skip).toBeFocused();
      await skip.press('Enter');
      await expect(page.locator('#main-content')).toBeFocused();

      await expect(page.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const sidebar = page.getByRole('button', { name: 'Toggle sidebar' });
      await sidebar.focus();
      await sidebar.press('Enter');
      await expect(sidebar).toBeFocused();

      const account = page.getByRole('button', { name: 'Account menu' });
      await account.focus();
      await account.press('Enter');
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await assertFocusContained(page, menu);
      const focusedBeforeArrow = page.locator('[role="menuitem"]:focus');
      await expect(focusedBeforeArrow).toHaveCount(1);
      const initialItemText = await focusedBeforeArrow.innerText();
      await page.keyboard.press('ArrowDown');
      const focusedAfterArrow = page.locator('[role="menuitem"]:focus');
      await expect(focusedAfterArrow).toHaveCount(1);
      expect(await focusedAfterArrow.innerText()).not.toBe(initialItemText);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(account).toBeFocused();
      expect(external()).toEqual([]);
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('account and settings navigation strips are keyboard operable and identify current page', async ({
    browser,
  }) => {
    const { context, page, mutationAudit } = await gotoAs(browser, 'admin', '/account/security');
    try {
      const accountNav = page.getByRole('navigation', { name: /account/i });
      const current = accountNav.getByRole('link', { name: /security/i });
      await expect(current).toHaveAttribute('aria-current', 'page');
      await current.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(current).toBeFocused();
      const profileLink = accountNav.getByRole('link', { name: 'Profile', exact: true });
      await profileLink.focus();
      await profileLink.press('Enter');
      await expect(page).toHaveURL(/\/account$/u);

      await page.goto('/admin/settings/security', { waitUntil: 'networkidle' });
      const settings = page.getByRole('navigation', { name: 'Settings sections' });
      await expect(settings.getByRole('link', { name: /security/i })).toHaveAttribute(
        'aria-current',
        'page',
      );
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('Company filter reaches no-results and reset recovers fixture data', async ({ browser }) => {
    const { context, page, mutationAudit } = await gotoAs(browser, 'admin', '/admin/companies');
    const writes = recordMutationRequests(page);
    try {
      const search = page.getByRole('textbox').first();
      await search.fill('definitely-no-p2-company-match');
      await search.press('Enter');
      await expect(page).toHaveURL(/(?:\?|&)q=definitely-no-p2-company-match(?:&|$)/u);
      await expect(page.getByText(/no companies|no results|no matching/i).first()).toBeVisible();
      const reset = page.getByRole('link', { name: /clear|reset|all companies/i }).first();
      await reset.focus();
      await reset.press('Enter');
      await expect(page).not.toHaveURL(/q=definitely-no-p2-company-match/u);
      await expect(
        page.getByText('P2.12 Local Acceptance Company', { exact: false }).first(),
      ).toBeVisible();
      expect(writes()).toEqual([]);
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('tables expose headers and a labelled horizontal scroll region', async ({ browser }) => {
    const { context, page, mutationAudit } = await gotoAs(browser, 'admin', '/admin/users');
    try {
      const region = page
        .getByRole('region')
        .filter({ has: page.getByRole('table') })
        .first();
      await expect(region).toHaveAttribute('aria-label', /.+/u);
      await expect(region.getByRole('columnheader').first()).toBeVisible();
      await expect(region.getByRole('row').nth(1)).toBeVisible();
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('CMS native link dialog cancels with Escape semantics, restores focus, and performs no write', async ({
    browser,
  }) => {
    const { context, page, mutationAudit } = await gotoAs(
      browser,
      'admin',
      `/admin/blog/${fixture.blogCmsId}`,
    );
    const writes = recordMutationRequests(page);
    try {
      const trigger = page.getByRole('button', { name: 'Link', exact: true });
      await trigger.focus();
      const dismissed = new Promise<void>((resolve, reject) => {
        page.once('dialog', async (dialog) => {
          try {
            expect(dialog.type()).toBe('prompt');
            expect(dialog.message()).toMatch(/link url/i);
            await dialog.dismiss();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
      await trigger.press('Enter');
      await dismissed;
      await expect(trigger).toBeFocused();
      expect(writes()).toEqual([]);
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('Company creation validation stays local and focuses or links the first invalid field', async ({
    browser,
  }) => {
    const { context, page, mutationAudit } = await gotoAs(browser, 'admin', '/admin/companies/new');
    const writes = recordMutationRequests(page);
    try {
      const submit = page.getByRole('button', { name: /create|save|continue/i }).last();
      await submit.click();
      const invalid = page
        .locator('input:invalid, select:invalid, textarea:invalid, [aria-invalid="true"]')
        .first();
      await expect(invalid).toBeVisible();
      await expect(invalid).toBeFocused();
      expect(writes()).toEqual([]);
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('document actions retain the private boundary without downloading', async ({ browser }) => {
    const { context, page, mutationAudit } = await gotoAs(
      browser,
      'customer',
      fixture.customerDocumentsPath,
    );
    const writes = recordMutationRequests(page);
    try {
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/document/i);
      const directLeaks = await page
        .locator('a')
        .evaluateAll((links) =>
          links
            .map((link) => link.getAttribute('href') ?? '')
            .filter((href) => /storage\/v1\/object|supabase\.co|service_role/iu.test(href)),
        );
      expect(directLeaks).toEqual([]);
      expect(writes()).toEqual([]);
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('chart has an accessible name and visible data alternative', async ({ browser }) => {
    const { context, page, mutationAudit } = await gotoAs(browser, 'pro', fixture.proDashboardPath);
    try {
      const chart = page.getByRole('region', { name: /case velocity/i });
      await expect(chart).toBeVisible();
      await expect(chart.getByText(/opened|completed/i).first()).toBeVisible();
      await chart.locator('summary').click();
      await expect(chart.getByRole('table')).toBeVisible();
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('timeline is ordered and status meaning is available as text', async ({ browser }) => {
    const { context, page, mutationAudit } = await gotoAs(
      browser,
      'employee',
      fixture.employeeIdentityPath,
    );
    try {
      const timeline = page
        .locator('ol')
        .filter({ has: page.locator('li') })
        .first();
      await expect(timeline).toBeVisible();
      expect(await timeline.locator('li').count()).toBeGreaterThan(0);
      for (const item of await timeline.locator('li').all()) {
        await expect(item).toContainText(/\S/u);
      }
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });

  test('unavailable workspace explains the boundary and offers only safe destinations', async ({
    browser,
  }) => {
    const { context, page, mutationAudit } = await gotoAs(browser, 'admin', '/admin/tasks');
    try {
      await expect(page.getByText(/unavailable|not available|not yet/i).first()).toBeVisible();
      const links = await page
        .locator('main a')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href));
      expect(links.every((href) => new URL(href).origin === fixture.origin)).toBe(true);
      await expect(page.getByRole('button', { name: /create|send|schedule/i })).toHaveCount(0);
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  });
});
