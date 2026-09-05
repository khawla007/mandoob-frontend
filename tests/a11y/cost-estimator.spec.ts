import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import path from 'node:path';

const matrix = [
  { width: 1280, height: 800, theme: 'light' },
  { width: 1280, height: 800, theme: 'dark' },
  { width: 1440, height: 900, theme: 'light' },
  { width: 1440, height: 900, theme: 'dark' },
] as const;

test.setTimeout(60_000);

for (const entry of matrix) {
  test(`initial estimator is accessible at ${entry.width}x${entry.height} ${entry.theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: entry.width, height: entry.height });
    await page.addInitScript((theme) => localStorage.setItem('theme', theme), entry.theme);
    await page.goto('/estimate', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'UAE business setup cost estimator' }),
    ).toBeVisible();

    expect(await page.locator('h1').count()).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(page.locator('.estimator-hero__visual img')).toHaveAttribute(
      'src',
      /mainland-hero\.webp/u,
    );

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('pending and successful estimate states remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem(
      'mandoob.estimator.draft',
      JSON.stringify({
        schemaVersion: 1,
        catalogVersion: 'p1.08-demo-2026-09-05',
        savedAt: new Date().toISOString(),
        draft: {
          jurisdiction: 'free_zone',
          authorityId: 'dmcc',
          activityId: 'professional-services',
          legalStructureId: 'fz_llc',
          shareholderCount: '2',
          visaCount: '1',
          officeTypeId: 'flexi',
          addOnIds: ['bank-account-assistance'],
        },
      }),
    );
  });
  await page.goto('/estimate', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Calculate indicative estimate' }).click();
  await expect(page.getByText('Calculating your indicative estimate…')).toBeVisible();

  const evidenceDirectory = process.env.P1_08_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await page.screenshot({
      path: path.join(evidenceDirectory, 'calculation-pending.png'),
      fullPage: false,
    });
  }

  await expect(page.getByText('Indicative estimate calculated.')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('reset confirmation closes with Escape and restores trigger focus', async ({ page }) => {
  await page.goto('/estimate', { waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: /Mainland/u }).click();
  const reset = page.getByRole('button', { name: 'Reset' });

  await reset.click();
  await expect(page.getByRole('dialog', { name: 'Reset this estimator?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep my selections' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Reset this estimator?' })).toBeHidden();
  await expect(reset).toBeFocused();
});
