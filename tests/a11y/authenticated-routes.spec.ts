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
