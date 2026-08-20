// Public (unauthenticated) a11y gate.
//
// Authenticated routes have moved to tests/a11y/authenticated-routes.spec.ts,
// which depends on the `setup` project for per-role storage states. Keeping
// this file public-only means the gate stays useful even when seed creds for
// authenticated roles aren't configured.

import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type PublicRoute = {
  name: string;
  path: string;
};

const routes: PublicRoute[] = [
  { name: 'public homepage', path: '/' },
  { name: 'public estimate', path: '/estimate' },
  { name: 'login', path: '/login' },
];

for (const route of routes) {
  test(`${route.name} has no detectable axe violations`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('company status utility computes AA contrast on selected rows in both dashboard themes', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const surface = document.createElement('div');
    surface.className = 'dashboard-surface';
    const row = document.createElement('div');
    row.dataset.companyStatusRow = 'true';
    row.className = 'bg-muted';
    const status = document.createElement('span');
    status.dataset.companyStatus = 'true';
    status.className = 'text-foreground/70 text-xs';
    status.textContent = 'Status';
    row.append(status);
    surface.append(row);
    document.body.append(surface);
  });

  for (const mode of ['light', 'dark'] as const) {
    await page.evaluate((nextMode) => {
      document.documentElement.classList.toggle('dark', nextMode === 'dark');
    }, mode);
    const results = await new AxeBuilder({ page })
      .include('[data-company-status-row]')
      .withRules(['color-contrast'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});
