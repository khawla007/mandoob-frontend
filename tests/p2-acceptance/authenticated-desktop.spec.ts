import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { sanitizeBrowserDiagnostic } from '@/lib/testing/browser-diagnostics';
import { isExpectedNextPrefetchAbort } from '@/lib/testing/p2-acceptance-request-failures';

type Role = 'admin' | 'pro' | 'customer' | 'employee';
type Route = { number: number; role: Role; path: string; tier: string };
type Manifest = { tenantSlug: string; aliases: Record<string, string> };

const baseURL = 'http://127.0.0.1:3100';
const evidenceRoot = resolve(
  process.cwd(),
  '../../../Reports/launch-gate-evidence/2026-09-07/dashboard-phase-2/p2-12-authenticated-desktop-acceptance',
);
const matrixPath = resolve(evidenceRoot, 'route-and-state-acceptance-matrix.md');
const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/.auth/p2-credentials.json'), 'utf8'),
) as Manifest;
const matrix = readFileSync(matrixPath, 'utf8');

function resolvePath(path: string) {
  const aliases: Record<string, string> = {
    ...manifest.aliases,
    tenant: manifest.tenantSlug,
    cms: path.includes('/blog/') ? manifest.aliases.blogCms : manifest.aliases.pageCms,
  };
  return path.replace(/\{([^}]+)\}/gu, (_match, key: string) => {
    const value = aliases[key];
    if (!value) throw new Error(`P2_ROUTE_MANIFEST: missing alias ${key}`);
    return value;
  });
}

const routes: Route[] = [
  ...matrix.matchAll(
    /^\| (\d+) \| (Admin|PRO|Customer|Employee|Shared) \| `([^`]+)` .*?\| (A[^|]+) \|/gmu,
  ),
].map(([, number, role, path, tier]) => ({
  number: Number(number),
  role:
    role === 'PRO'
      ? 'pro'
      : role === 'Shared'
        ? path === '/account/role'
          ? 'pro'
          : 'admin'
        : (role.toLowerCase() as Role),
  path: resolvePath(path),
  tier: tier.trim(),
}));

if (routes.length !== 108)
  throw new Error(`P2_ROUTE_MANIFEST: expected 108 routes, got ${routes.length}`);

test.describe.configure({ mode: 'parallel' });

for (const route of routes) {
  for (const theme of ['light', 'dark'] as const) {
    test(`P2A-${String(route.number).padStart(3, '0')} ${route.role} ${theme} ${route.path}`, async ({
      browser,
    }, testInfo) => {
      const expectedCanonicalHref =
        route.number === 53 ? new URL(`/t/${manifest.tenantSlug}/company`, baseURL).href : null;
      const canonicalUrl = expectedCanonicalHref ? new URL(expectedCanonicalHref) : null;
      const context = await browser.newContext({
        baseURL,
        colorScheme: theme,
        storageState: resolve(process.cwd(), `tests/.auth/${route.role}.json`),
        viewport: { width: 1440, height: 900 },
      });
      await context.addInitScript((value) => window.localStorage.setItem('theme', value), theme);
      const page = await context.newPage();
      const diagnostics: string[] = [];
      page.on('pageerror', (error) =>
        diagnostics.push(`pageerror:${sanitizeBrowserDiagnostic(error.message)}`),
      );
      page.on('console', (message) => {
        if (message.type() === 'error')
          diagnostics.push(`console:${sanitizeBrowserDiagnostic(message.text())}`);
      });
      page.on('requestfailed', (request) => {
        const url = new URL(request.url());
        const error = request.failure()?.errorText ?? 'unknown';
        const expectedCanonicalRedirectAbort =
          canonicalUrl !== null &&
          error === 'net::ERR_ABORTED' &&
          request.resourceType() === 'document' &&
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame() &&
          url.origin === canonicalUrl.origin &&
          url.href === canonicalUrl.href;
        const expectedPrefetchAbort = isExpectedNextPrefetchAbort(
          {
            errorText: error,
            resourceType: request.resourceType(),
            isNavigationRequest: request.isNavigationRequest(),
            url: request.url(),
            headers: request.headers(),
          },
          new URL(baseURL).origin,
        );
        if (expectedCanonicalRedirectAbort || expectedPrefetchAbort) return;
        diagnostics.push(`requestfailed:${error}:${url.pathname}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 500)
          diagnostics.push(`response:${response.status()}:${new URL(response.url()).pathname}`);
      });
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
          diagnostics.push(`nonloopback:${url.origin}`);
        }
      });
      try {
        const response = await page.goto(route.path, { waitUntil: 'networkidle' });
        expect(response?.status() ?? 0).toBeLessThan(500);
        if (expectedCanonicalHref) {
          expect(page.url()).toBe(expectedCanonicalHref);
          expect(new URL(page.url()).pathname).toBe(new URL(expectedCanonicalHref).pathname);
        }
        expect(new URL(page.url()).pathname).not.toBe('/login');
        if (route.number < 107) expect(new URL(page.url()).pathname).not.toMatch(/^\/mfa\//u);
        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.locator('html')).toHaveClass(new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`));
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
        const brokenImages = await page
          .locator('img')
          .evaluateAll(
            (images) =>
              images.filter(
                (image) =>
                  !(image as HTMLImageElement).complete ||
                  (image as HTMLImageElement).naturalWidth === 0,
              ).length,
          );
        expect(brokenImages).toBe(0);
        const body = await page.locator('body').innerText();
        expect(body).not.toMatch(
          /(?:eyJ[a-zA-Z0-9_-]{20,}|pro-credentials\/|service_role|postgres(?:ql)?:\/\/|supabase\.co)/u,
        );
        const axe = await new AxeBuilder({ page }).analyze();
        const blocking = axe.violations.filter(
          ({ impact }) => impact === 'critical' || impact === 'serious',
        );
        expect(
          blocking,
          JSON.stringify(
            blocking.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })),
          ),
        ).toEqual([]);
        await testInfo.attach('axe-lower-findings', {
          body: JSON.stringify(
            axe.violations
              .filter(({ impact }) => impact === 'moderate' || impact === 'minor')
              .map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })),
          ),
          contentType: 'application/json',
        });
        expect(diagnostics).toEqual([]);

        if (!route.tier.includes('B:—')) {
          const base = resolve(
            evidenceRoot,
            'screenshots',
            route.role,
            theme,
            '1440x900',
            `${String(route.number).padStart(3, '0')}.png`,
          );
          await mkdir(dirname(base), { recursive: true });
          await page.screenshot({ path: base, fullPage: true });
          if (route.tier.includes('R')) {
            await page.setViewportSize({ width: 1536, height: 1024 });
            const ref = resolve(
              evidenceRoot,
              'screenshots',
              route.role,
              theme,
              '1536x1024',
              `${String(route.number).padStart(3, '0')}.png`,
            );
            await mkdir(dirname(ref), { recursive: true });
            await page.screenshot({ path: ref, fullPage: true });
          }
          if (route.tier.includes('W')) {
            await page.setViewportSize({ width: 1920, height: 1080 });
            const wide = resolve(
              evidenceRoot,
              'screenshots',
              route.role,
              theme,
              '1920x1080',
              `${String(route.number).padStart(3, '0')}.png`,
            );
            await mkdir(dirname(wide), { recursive: true });
            await page.screenshot({ path: wide, fullPage: true });
          }
        }
      } finally {
        await context.close();
      }
    });
  }
}
