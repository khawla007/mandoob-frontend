import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { sanitizeBrowserDiagnostic } from './browser-diagnostics';

const tenant = process.env.E2E_TENANT_SLUG ?? process.env.LAUNCH_TENANT_SLUG ?? 'firm';
const dashboardPath = `/t/${tenant}/dashboard`;
const storagePath = resolve(process.cwd(), 'tests/.auth/pro.json');
const missingAuthReason =
  `Storage state for pro not found at ${storagePath}. ` +
  'Set E2E_PRO_EMAIL/PASSWORD and rerun the setup project.';

type ProFixtures = { proPage: Page };

function registerBrowserDiagnostics(page: Page) {
  const unexpected: string[] = [];

  // There is intentionally no allowlist: this dashboard is expected to emit
  // neither page errors nor console.error entries during any tested journey.
  page.on('pageerror', (error) => {
    unexpected.push(`pageerror: ${sanitizeBrowserDiagnostic(error.message)}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      unexpected.push(`console.error: ${sanitizeBrowserDiagnostic(message.text())}`);
    }
  });

  return {
    assertClean: () =>
      expect(unexpected, 'unexpected sanitized browser errors collected during navigation').toEqual(
        [],
      ),
  };
}

async function finishManualContext(
  context: BrowserContext,
  testInfo: TestInfo,
  diagnostics: ReturnType<typeof registerBrowserDiagnostics>,
  scenarioFailure: unknown,
) {
  let diagnosticFailure: unknown = null;
  try {
    diagnostics.assertClean();
  } catch (error) {
    diagnosticFailure = error;
  }

  const failed =
    scenarioFailure !== null ||
    diagnosticFailure !== null ||
    testInfo.status !== testInfo.expectedStatus;
  try {
    await context.tracing.stop(
      failed ? { path: testInfo.outputPath('manual-context-trace.zip') } : undefined,
    );
  } finally {
    await context.close();
  }

  if (diagnosticFailure !== null && scenarioFailure === null) throw diagnosticFailure;
}

const test = base.extend<ProFixtures>({
  proPage: async ({ browser, baseURL }, provide, testInfo) => {
    if (!existsSync(storagePath)) {
      console.warn(`[a11y] SKIP PRO Signal Studio: ${missingAuthReason}`);
      testInfo.skip(true, missingAuthReason);
      return;
    }

    const context = await browser.newContext({ baseURL, storageState: storagePath });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    const diagnostics = registerBrowserDiagnostics(page);
    let scenarioFailure: unknown = null;
    try {
      await page.goto(dashboardPath, { waitUntil: 'networkidle' });
      expect(
        page.url(),
        '[a11y] PRO dashboard redirected to /login; tests/.auth/pro.json is stale or invalid',
      ).not.toContain('/login');
      await provide(page);
    } catch (error) {
      scenarioFailure = error;
      throw error;
    } finally {
      await finishManualContext(context, testInfo, diagnostics, scenarioFailure);
    }
  },
});

test('unauthenticated PRO dashboard navigation redirects to login', async ({ page }) => {
  const diagnostics = registerBrowserDiagnostics(page);
  try {
    await page.goto(dashboardPath, { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  } finally {
    diagnostics.assertClean();
  }
});

test('Signal Studio exposes its command center, application actions, and chart data', async ({
  proPage,
}) => {
  await expect(proPage.getByRole('heading', { level: 1, name: 'Command Center' })).toBeVisible();
  await expect(proPage.getByText(/\btenant\b/i)).toHaveCount(0);

  const openActionDeck = proPage.getByRole('link', { name: 'Open Action Deck' });
  await expect(openActionDeck).toHaveAttribute('href', new RegExp(`/t/${tenant}/applications\\?`));
  await expect(proPage.getByRole('link', { name: 'Assign work' })).toHaveAttribute(
    'href',
    new RegExp(`/t/${tenant}/applications\\?`),
  );

  const velocity = proPage.getByTestId('case-velocity');
  await expect(velocity).toHaveAttribute('aria-hidden', 'true');
  const velocityRegion = velocity.locator('xpath=ancestor::*[@role="region"][1]');
  await expect(velocityRegion).toHaveAttribute('aria-labelledby', 'case-velocity-title');

  const tableDisclosure = velocityRegion.getByText('Show accessible data table', { exact: true });
  await tableDisclosure.focus();
  await tableDisclosure.press('Enter');
  await expect(velocityRegion.getByRole('table')).toBeVisible();
  await expect(velocityRegion.getByRole('columnheader', { name: 'Date' })).toBeVisible();
  await expect(velocityRegion.getByRole('columnheader', { name: 'Opened' })).toBeVisible();
  await expect(velocityRegion.getByRole('columnheader', { name: 'Completed' })).toBeVisible();

  const sevenDays = velocityRegion.getByRole('link', { name: '7d' });
  await sevenDays.focus();
  await expect(sevenDays).toBeFocused();
  await sevenDays.press('Enter');
  await expect(proPage).toHaveURL(/(?:\?|&)range=7(?:&|$)/);
});

test('desktop heatmap supports roving arrows, dialog keyboard control, and focus restore', async ({
  proPage,
}) => {
  await proPage.setViewportSize({ width: 768, height: 1024 });
  const grid = proPage.getByRole('grid', { name: 'Deadline intensity by date and time period' });
  await expect(grid).toBeVisible();

  const cells = grid.getByRole('button');
  const first = cells.first();
  await first.focus();
  await expect(first).toBeFocused();
  await first.press('ArrowRight');
  const second = cells.nth(1);
  await expect(second).toBeFocused();

  await second.press('Enter');
  const dialog = proPage.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close deadline details' })).toBeVisible();
  await proPage.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(second).toBeFocused();
});

for (const { theme, viewport } of [
  { theme: 'light', viewport: { width: 1440, height: 900 } },
  { theme: 'dark', viewport: { width: 1440, height: 900 } },
  { theme: 'light', viewport: { width: 1024, height: 768 } },
  { theme: 'dark', viewport: { width: 1024, height: 768 } },
  { theme: 'light', viewport: { width: 390, height: 844 } },
  { theme: 'dark', viewport: { width: 390, height: 844 } },
  { theme: 'light', viewport: { width: 768, height: 1024 } },
  { theme: 'dark', viewport: { width: 768, height: 1024 } },
] as const) {
  test(`${theme} Signal Studio at ${viewport.width}x${viewport.height} has no serious axe findings or horizontal overflow`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    if (!existsSync(storagePath)) {
      console.warn(`[a11y] SKIP PRO Signal Studio: ${missingAuthReason}`);
      testInfo.skip(true, missingAuthReason);
      return;
    }

    const context = await browser.newContext({
      baseURL,
      colorScheme: theme,
      storageState: storagePath,
      viewport,
    });
    await context.addInitScript((selectedTheme) => {
      window.localStorage.setItem('theme', selectedTheme);
    }, theme);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    const diagnostics = registerBrowserDiagnostics(page);
    let scenarioFailure: unknown = null;
    try {
      await page.goto(dashboardPath, { waitUntil: 'networkidle' });
      expect(page.url()).not.toContain('/login');
      await expect(page.getByRole('heading', { level: 1, name: 'Command Center' })).toBeVisible();
      await expect(page.locator('html')).toHaveClass(new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`));

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        'dashboard must not horizontally overflow the viewport',
      ).toBe(true);

      const results = await new AxeBuilder({ page }).analyze();
      const severe = results.violations.filter(
        ({ impact }) => impact === 'serious' || impact === 'critical',
      );
      expect(severe).toEqual([]);

      const focusTarget = page.getByRole('link', { name: 'Open Action Deck' });
      await focusTarget.focus();
      await expect(focusTarget).toBeFocused();
      expect(
        await focusTarget.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            element.matches(':focus-visible') &&
            (style.boxShadow !== 'none' || style.outlineStyle !== 'none')
          );
        }),
        'the focused primary action must have a visible focus indicator',
      ).toBe(true);
    } catch (error) {
      scenarioFailure = error;
      throw error;
    } finally {
      await finishManualContext(context, testInfo, diagnostics, scenarioFailure);
    }
  });
}
