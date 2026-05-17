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
