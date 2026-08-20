// Authenticated a11y gate.
//
// Loads per-role storage states produced by tests/auth.setup.ts and runs the
// same axe rules as the public spec. If a role's storage file is missing
// (because its env creds were not provided), that test SKIPS with a clear
// warning — it does NOT fail. This matches locked decision #5 in
// docs/step-30b-prompt.md.

import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function luminance(rgb: string): number {
  const channels = rgb
    .match(/[\d.]+/gu)
    ?.slice(0, 3)
    .map(Number)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  expect(channels, `expected an RGB color, received ${rgb}`).toHaveLength(3);
  return 0.2126 * channels![0] + 0.7152 * channels![1] + 0.0722 * channels![2];
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

type AuthedRoute = {
  name: string;
  role: 'admin' | 'pro' | 'customer' | 'employee';
  path: string;
};

const tenant = process.env.E2E_TENANT_SLUG ?? process.env.LAUNCH_TENANT_SLUG ?? 'firm';

// Canonical paths only — never alias/redirect routes. The employee canonical
// path is /t/{slug}/employee/dashboard (see
// src/app/(tenant)/t/[tenant]/(employee)/employee/dashboard/page.tsx).
const routes: AuthedRoute[] = [
  { name: 'admin overview', role: 'admin', path: '/admin' },
  { name: 'PRO dashboard', role: 'pro', path: `/t/${tenant}/dashboard` },
  { name: 'customer portal', role: 'customer', path: `/t/${tenant}/portal` },
  { name: 'employee dashboard', role: 'employee', path: `/t/${tenant}/employee/dashboard` },
];

for (const route of routes) {
  test(`${route.name} (${route.role}) has no detectable axe violations`, async ({
    browser,
  }, testInfo) => {
    const storagePath = resolve(process.cwd(), 'tests/.auth', `${route.role}.json`);
    if (!existsSync(storagePath)) {
      const reason = `Storage state for ${route.role} not found at ${storagePath}. Set E2E_${route.role.toUpperCase()}_EMAIL/PASSWORD and rerun.`;

      console.warn(`[a11y] SKIP ${route.name}: ${reason}`);
      testInfo.skip(true, reason);
      return;
    }

    const context = await browser.newContext({ storageState: storagePath });
    const page = await context.newPage();
    try {
      await page.goto(route.path, { waitUntil: 'networkidle' });
      await expect(page.locator('body')).toBeVisible();

      // Auth assertion: a stale storage state would silently redirect to
      // /login and axe would still pass on the login page, certifying the
      // wrong surface. Guard against that before running axe.
      expect(
        page.url(),
        `[a11y] ${route.name} redirected to /login — storage state for ${route.role} is stale or invalid`,
      ).not.toContain('/login');

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('dashboard token pairs reach a real body-portaled dialog in light and dark modes', async ({
  browser,
}, testInfo) => {
  const storagePath = resolve(process.cwd(), 'tests/.auth/admin.json');
  if (!existsSync(storagePath)) {
    testInfo.skip(true, `Storage state for admin not found at ${storagePath}.`);
    return;
  }

  const context = await browser.newContext({ storageState: storagePath });
  const page = await context.newPage();
  try {
    await page.goto('/admin/cost-data', { waitUntil: 'networkidle' });
    expect(page.url()).not.toContain('/login');

    for (const mode of ['light', 'dark'] as const) {
      await page.evaluate((nextMode) => {
        document.documentElement.classList.toggle('dark', nextMode === 'dark');
      }, mode);
      await page
        .getByRole('button', { name: /import/i })
        .first()
        .click();
      const dialog = page.locator('[data-slot="dialog-content"]');
      await expect(dialog).toBeVisible();
      expect(await dialog.locator('.dashboard-surface').count()).toBe(0);

      const submit = dialog.locator('button.bg-primary.text-primary-foreground').first();
      await expect(submit).toBeVisible();
      await dialog.evaluate((node) => {
        const probe = document.createElement('span');
        probe.dataset.tokenProbe = 'primary-copy';
        probe.className = 'text-primary';
        probe.textContent = 'Primary copy';
        node.append(probe);
      });
      const styles = await page.evaluate(() => {
        const button = document.querySelector<HTMLElement>(
          '[data-slot="dialog-content"] button.bg-primary.text-primary-foreground',
        );
        const copy = document.querySelector<HTMLElement>('[data-token-probe="primary-copy"]');
        const dialog = document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
        if (!button || !copy || !dialog) throw new Error('portal token probes were not rendered');
        return {
          buttonBackground: getComputedStyle(button).backgroundColor,
          buttonForeground: getComputedStyle(button).color,
          copyForeground: getComputedStyle(copy).color,
          primary: getComputedStyle(document.body).getPropertyValue('--primary').trim(),
          primaryForeground: getComputedStyle(document.body)
            .getPropertyValue('--primary-foreground')
            .trim(),
        };
      });
      expect(
        contrastRatio(styles.buttonBackground, styles.buttonForeground),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          mode === 'dark' ? 'rgb(20, 19, 18)' : 'rgb(255, 255, 255)',
          styles.copyForeground,
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(styles.primary).toBe(mode === 'dark' ? '#ff8a65' : '#c2410c');
      if (mode === 'dark') {
        expect(styles.primaryForeground).toBe('#141312');
      } else {
        expect(['#fff', '#ffffff']).toContain(styles.primaryForeground);
      }
      await dialog.getByRole('button', { name: /close/i }).click();
    }
  } finally {
    await context.close();
  }
});
