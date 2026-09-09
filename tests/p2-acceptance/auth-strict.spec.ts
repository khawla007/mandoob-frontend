import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

type Role = 'admin' | 'pro' | 'customer' | 'employee';
type StrictManifest = { tenantSlug: string };

const strict = process.env.P2_ACCEPTANCE_STRICT === '1';
const authDir = resolve(process.cwd(), 'tests/.auth');
const manifest = strict
  ? (JSON.parse(readFileSync(resolve(authDir, 'p2-credentials.json'), 'utf8')) as StrictManifest)
  : null;
const tenant = encodeURIComponent(manifest?.tenantSlug ?? 'strict-mode-required');
const homes: ReadonlyArray<{ role: Role; path: string }> = [
  { role: 'admin', path: '/admin' },
  { role: 'pro', path: `/t/${tenant}/dashboard` },
  { role: 'customer', path: `/t/${tenant}/portal` },
  { role: 'employee', path: `/t/${tenant}/employee/dashboard` },
];

test.describe.configure({ mode: 'serial', retries: 0 });
test.skip(!strict, 'P2_ACCEPTANCE_STRICT=1 is required for strict auth runtime checks');

for (const { role, path } of homes) {
  test(`${role} state reaches its exact guarded home`, async ({ browser }) => {
    const context = await browser.newContext({
      storageState: resolve(authDir, `${role}.json`),
    });
    try {
      const page = await context.newPage();
      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.ok()).toBe(true);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator('.dashboard-surface')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    } finally {
      await context.close();
    }
  });
}

test('customer state is denied from the Admin surface', async ({ browser }) => {
  const context = await browser.newContext({
    storageState: resolve(authDir, 'customer.json'),
  });
  try {
    const page = await context.newPage();
    await page.goto('/admin', { waitUntil: 'networkidle' });
    expect(new URL(page.url()).pathname).not.toBe('/admin');
    expect(new URL(page.url()).pathname).toBe('/login');
  } finally {
    await context.close();
  }
});

test('strict storage directory and all role states are owner-only at runtime', async () => {
  expect((await stat(authDir)).mode & 0o777).toBe(0o700);
  for (const { role } of homes) {
    const storagePath = resolve(authDir, `${role}.json`);
    expect(dirname(storagePath)).toBe(authDir);
    expect((await stat(storagePath)).mode & 0o777).toBe(0o600);
  }
});
