import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';

type LaunchRoute = {
  name: string;
  path: string;
  storageStateEnv?: string;
};

const tenant = process.env.LAUNCH_TENANT_SLUG ?? 'demo';

const routes: LaunchRoute[] = [
  { name: 'public homepage', path: '/' },
  { name: 'public estimate', path: '/estimate' },
  { name: 'login', path: '/login' },
  { name: 'admin overview', path: '/admin', storageStateEnv: 'LAUNCH_ADMIN_STORAGE_STATE' },
  {
    name: 'PRO dashboard',
    path: `/t/${tenant}/dashboard`,
    storageStateEnv: 'LAUNCH_PRO_STORAGE_STATE',
  },
  {
    name: 'customer portal',
    path: `/t/${tenant}/portal`,
    storageStateEnv: 'LAUNCH_CUSTOMER_STORAGE_STATE',
  },
  {
    name: 'employee dashboard',
    path: `/t/${tenant}/employee/dashboard`,
    storageStateEnv: 'LAUNCH_EMPLOYEE_STORAGE_STATE',
  },
];

for (const route of routes) {
  test(`${route.name} has no detectable axe violations`, async ({ browser, page }) => {
    let authenticatedContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

    if (route.storageStateEnv) {
      const storageState = process.env[route.storageStateEnv];
      test.skip(
        !storageState || !existsSync(storageState),
        `${route.storageStateEnv} must point to a Playwright storage state file`,
      );

      authenticatedContext = await browser.newContext({ storageState });
      page = await authenticatedContext.newPage();
    }

    try {
      await page.goto(route.path, { waitUntil: 'networkidle' });
      await expect(page.locator('body')).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await authenticatedContext?.close();
    }
  });
}
