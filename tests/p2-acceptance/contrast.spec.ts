import { expect, test } from '@playwright/test';

import { collectContrastSamples, gotoAs, writeContrastEvidence } from './support/tier-c';

test('P2.12 computed contrast samples meet AA in both themes', async ({ browser }) => {
  const all = [];
  for (const theme of ['light', 'dark'] as const) {
    const { context, page, mutationAudit } = await gotoAs(browser, 'admin', '/admin', { theme });
    try {
      all.push(...(await collectContrastSamples(page, theme, '/admin')));
      await page.goto('/admin/users', { waitUntil: 'networkidle' });
      all.push(...(await collectContrastSamples(page, theme, '/admin/users')));
      await page.goto('/admin/system-status', { waitUntil: 'networkidle' });
      all.push(...(await collectContrastSamples(page, theme, '/admin/system-status')));
    } finally {
      mutationAudit.assertZero();
      await context.close();
    }
  }
  await writeContrastEvidence(all);
  expect(
    all.filter(({ pass }) => !pass),
    all
      .filter(({ pass }) => !pass)
      .map(
        ({ theme, route, label, ratio, threshold }) =>
          `${theme} ${route} ${label}: ${ratio.toFixed(2)} < ${threshold}`,
      )
      .join('\n'),
  ).toEqual([]);
});
