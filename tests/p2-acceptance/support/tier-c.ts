import { expect, type Browser, type Locator, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Role = 'admin' | 'pro' | 'customer' | 'employee';
type Theme = 'light' | 'dark';
type Manifest = { tenantSlug: string; aliases: Record<string, string> };

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/.auth/p2-credentials.json'), 'utf8'),
) as Manifest;
const origin = 'http://127.0.0.1:3100';
const tenant = encodeURIComponent(manifest.tenantSlug);

export const fixture = {
  origin,
  tenantSlug: manifest.tenantSlug,
  customerDocumentsPath: `/t/${tenant}/portal/documents`,
  employeeIdentityPath: `/t/${tenant}/employee/identity`,
  proDashboardPath: `/t/${tenant}/dashboard`,
  blogCmsId: manifest.aliases.blogCms,
} as const;

export async function gotoAs(
  browser: Browser,
  role: Role,
  path: string,
  options: { allowDenied?: boolean; theme?: Theme } = {},
) {
  const context = await browser.newContext({
    baseURL: origin,
    colorScheme: options.theme ?? 'light',
    storageState: resolve(process.cwd(), `tests/.auth/${role}.json`),
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(
    (theme) => window.localStorage.setItem('theme', theme),
    options.theme ?? 'light',
  );
  const page = await context.newPage();
  const mutationAudit = observeMutationRequests(page);
  const response = await page.goto(path, { waitUntil: 'networkidle' });
  expect(response?.status() ?? 0).toBeLessThan(500);
  expect(new URL(page.url()).origin).toBe(origin);
  if (!options.allowDenied) {
    expect(new URL(page.url()).pathname).not.toMatch(/^\/(?:login|mfa(?:\/|$))/u);
    await expect(page.locator('main')).toHaveCount(1);
  }
  mutationAudit.assertZero();
  return { context, page, mutationAudit };
}

export function observeMutationRequests(page: Page) {
  const applicationWrites: string[] = [];
  const authRefreshes: string[] = [];
  const classify = (request: Request) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return;
    const url = new URL(request.url());
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    const supportedRefresh =
      loopback &&
      request.method() === 'POST' &&
      (url.pathname === '/api/v1/auth/refresh' ||
        (url.pathname.endsWith('/auth/v1/token') &&
          url.searchParams.get('grant_type') === 'refresh_token'));
    const safe = `${request.method()} ${url.pathname}`;
    if (supportedRefresh) authRefreshes.push(safe);
    else applicationWrites.push(safe);
  };
  page.on('request', classify);
  return {
    applicationWrites: () => [...applicationWrites],
    authRefreshes: () => [...authRefreshes],
    assertZero: () =>
      expect(
        applicationWrites,
        `unexpected application mutations (local Auth refresh is classified separately): ${applicationWrites.join(', ')}`,
      ).toEqual([]),
  };
}

export function assertNoExternalRequests(page: Page) {
  const violations: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) violations.push(url.origin);
  });
  return () => [...new Set(violations)];
}

export function recordMutationRequests(page: Page) {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return;
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/auth/refresh') return;
    writes.push(`${request.method()} ${url.pathname}`);
  });
  return () => writes;
}

export async function assertFocusContained(page: Page, container: Locator) {
  await expect(container).toBeVisible();
  expect(
    await container.evaluate((node) => node.contains(document.activeElement)),
    'focus must move inside the opened popup/dialog',
  ).toBe(true);
}

export async function noSecretOrExistenceLeak(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(
    /(?:eyJ[a-zA-Z0-9_-]{20,}|service[_ -]?role|refresh[_ -]?token|access[_ -]?token|postgres(?:ql)?:\/\/|storage\/v1\/object|otpauth:\/\/)/iu,
  );
  const html = await page.locator('html').innerHTML();
  expect(html).not.toMatch(/(?:service[_ -]?role|postgres(?:ql)?:\/\/|otpauth:\/\/)/iu);
}

export type ContrastSample = {
  theme: Theme;
  route: string;
  label: string;
  selector: string;
  foreground: string;
  backgrounds: string[];
  ratio: number;
  threshold: number;
  kind: 'text' | 'non-text';
  pass: boolean;
  disposition: string;
};

type RawSample = Omit<ContrastSample, 'ratio' | 'threshold' | 'pass' | 'disposition'> & {
  fontSize: number;
  fontWeight: number;
};

const routeSamples: Record<
  string,
  Array<{ label: string; selector: string; kind?: 'non-text' }>
> = {
  '/admin': [
    { label: 'body text', selector: 'main' },
    { label: 'heading text', selector: 'main h1' },
    { label: 'muted text', selector: 'main .text-muted-foreground' },
    { label: 'link text', selector: 'main a' },
    { label: 'control text', selector: 'header button' },
    { label: 'focus ring', selector: 'header button[aria-label="Account menu"]', kind: 'non-text' },
    { label: 'inverse navigation text', selector: '[data-sidebar="sidebar"] a' },
  ],
  '/admin/users': [
    { label: 'table header', selector: 'main th' },
    { label: 'table cell', selector: 'main td' },
    { label: 'status badge text', selector: 'main [data-slot="badge"]' },
  ],
  '/admin/system-status': [
    { label: 'unavailable heading', selector: 'main h2' },
    { label: 'unavailable muted text', selector: 'main .text-muted-foreground' },
  ],
};

export async function collectContrastSamples(
  page: Page,
  theme: Theme,
  route: keyof typeof routeSamples,
): Promise<ContrastSample[]> {
  await expect(page.locator('html')).toHaveClass(new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`));
  const definitions = routeSamples[route];
  if (!definitions) throw new Error(`P2_CONTRAST: no frozen samples for ${route}`);

  const raw: RawSample[] = [];
  for (const definition of definitions) {
    const locator = page.locator(definition.selector).filter({ visible: true }).first();
    await expect(
      locator,
      `${route}: required contrast occurrence ${definition.label}`,
    ).toBeVisible();
    if (definition.label === 'focus ring') {
      await locator.focus();
      await locator.evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
    }
    const measured = await locator.evaluate(
      (element, input) => {
        const toRgb = (value: string) => {
          const oklch = value.match(
            /^oklch\(\s*([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%)?)?\s*\)$/u,
          );
          const oklab = value.match(
            /^oklab\(\s*([\d.]+)(%)?\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+)(%)?)?\s*\)$/u,
          );
          if (oklch || oklab) {
            const parsed = oklch ?? oklab!;
            const lightness = Number(parsed[1]) / (parsed[2] ? 100 : 1);
            const alpha = parsed[5] === undefined ? 1 : Number(parsed[5]) / (parsed[6] ? 100 : 1);
            const axisA = oklch
              ? Number(parsed[3]) * Math.cos((Number(parsed[4]) * Math.PI) / 180)
              : Number(parsed[3]);
            const axisB = oklch
              ? Number(parsed[3]) * Math.sin((Number(parsed[4]) * Math.PI) / 180)
              : Number(parsed[4]);
            const l = Math.pow(lightness + 0.3963377774 * axisA + 0.2158037573 * axisB, 3);
            const m = Math.pow(lightness - 0.1055613458 * axisA - 0.0638541728 * axisB, 3);
            const s = Math.pow(lightness - 0.0894841775 * axisA - 1.291485548 * axisB, 3);
            const channels = [
              4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
            ];
            const encode = (channel: number) =>
              Math.round(
                Math.max(
                  0,
                  Math.min(
                    1,
                    channel <= 0.0031308
                      ? 12.92 * channel
                      : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055,
                  ),
                ) * 255,
              );
            return `rgba(${encode(channels[0]!)}, ${encode(channels[1]!)}, ${encode(channels[2]!)}, ${alpha})`;
          }
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('P2_CONTRAST: canvas context unavailable');
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = '#ff00ff';
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
          return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
        };
        const parseColors = (value: string) =>
          [...value.matchAll(/(?:rgba?|oklch|oklab)\([^)]*\)|#[\da-f]{3,8}/giu)].map(
            ([candidate]) => toRgb(candidate),
          );
        const style = getComputedStyle(element);
        const alphaOf = (value: string) => Number(value.match(/,\s*([\d.]+)\)$/u)?.[1] ?? 1);
        const parents: Element[] = [];
        for (
          let current: Element | null = input.kind === 'non-text' ? element.parentElement : element;
          current;
          current = current.parentElement
        )
          parents.push(current);
        const backgroundLayers: string[] = [];
        for (const node of parents) {
          const computed = getComputedStyle(node);
          const gradientColors = parseColors(computed.backgroundImage);
          const solid = toRgb(computed.backgroundColor);
          if (gradientColors.length > 0) backgroundLayers.push(...gradientColors);
          if (alphaOf(solid) > 0) {
            backgroundLayers.push(solid);
            if (alphaOf(solid) >= 0.999) break;
          }
        }
        const canvas = input.fallback;
        let foreground = toRgb(style.color);
        if (input.focus) {
          if (!element.matches(':focus-visible'))
            throw new Error(`P2_CONTRAST: ${input.label} is not focus-visible after focus`);
          const visibleOutline =
            style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
          const shadowColors = parseColors(style.boxShadow).filter(
            (candidate) => alphaOf(candidate) > 0,
          );
          if (visibleOutline) foreground = toRgb(style.outlineColor);
          else if (shadowColors.length > 0) foreground = shadowColors.at(-1)!;
          else
            throw new Error(
              `P2_CONTRAST: ${input.label} has no parsed rendered indicator (outline=${style.outline}; box-shadow=${style.boxShadow})`,
            );
        } else if (input.kind === 'non-text') {
          const border = toRgb(style.borderColor);
          const hasBorder =
            alphaOf(border) > 0 &&
            [
              style.borderTopWidth,
              style.borderRightWidth,
              style.borderBottomWidth,
              style.borderLeftWidth,
            ]
              .map(Number.parseFloat)
              .some((width) => width > 0);
          const fill = toRgb(style.backgroundColor);
          if (hasBorder) foreground = border;
          else if (alphaOf(fill) > 0) foreground = fill;
          else throw new Error(`P2_CONTRAST: ${input.label} has no visible border or fill`);
        }
        return {
          foreground,
          backgrounds:
            backgroundLayers.length > 0 && alphaOf(backgroundLayers.at(-1)!) >= 0.999
              ? backgroundLayers
              : [...backgroundLayers, canvas],
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
        };
      },
      {
        focus: definition.label === 'focus ring',
        kind: definition.kind ?? 'text',
        label: definition.label,
        fallback: theme === 'light' ? 'rgba(255, 255, 255, 1)' : 'rgba(20, 19, 18, 1)',
      },
    );
    raw.push({
      theme,
      route,
      label: definition.label,
      selector: definition.selector,
      kind: definition.kind ?? 'text',
      ...measured,
    });
  }
  return raw.map(finalizeContrastSample);
}

type Rgba = [number, number, number, number];

function color(value: string): Rgba {
  const parts = value.match(/[\d.]+/gu)?.map(Number) ?? [];
  if (parts.length < 3) throw new Error(`P2_CONTRAST: unsupported computed color ${value}`);
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
}

function composite(front: Rgba, back: Rgba): Rgba {
  const alpha = front[3] + back[3] * (1 - front[3]);
  return [
    (front[0] * front[3] + back[0] * back[3] * (1 - front[3])) / alpha,
    (front[1] * front[3] + back[1] * back[3] * (1 - front[3])) / alpha,
    (front[2] * front[3] + back[2] * back[3] * (1 - front[3])) / alpha,
    alpha,
  ];
}

function luminance(value: Rgba): number {
  const channel = (component: number) => {
    const normalized = component / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return channel(value[0]) * 0.2126 + channel(value[1]) * 0.7152 + channel(value[2]) * 0.0722;
}

function ratio(a: Rgba, b: Rgba): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function finalizeContrastSample(raw: RawSample): ContrastSample {
  const backgroundColors = raw.backgrounds.map(color);
  const base = backgroundColors.at(-1) ?? [255, 255, 255, 1];
  const renderedBackgrounds = backgroundColors.slice(0, -1).map((layer) => composite(layer, base));
  if (renderedBackgrounds.length === 0) renderedBackgrounds.push(base);
  const foreground = color(raw.foreground);
  const measured = Math.min(
    ...renderedBackgrounds.map((background) =>
      ratio(composite(foreground, background), background),
    ),
  );
  const large = raw.fontSize >= 24 || (raw.fontSize >= 18.66 && raw.fontWeight >= 700);
  const threshold = raw.kind === 'non-text' || large ? 3 : 4.5;
  const pass = measured >= threshold;
  return {
    theme: raw.theme,
    route: raw.route,
    label: raw.label,
    selector: raw.selector,
    foreground: raw.foreground,
    backgrounds: raw.backgrounds,
    ratio: measured,
    threshold,
    kind: raw.kind,
    pass,
    disposition: pass
      ? `Passes WCAG AA ${threshold}:1 threshold.`
      : `OPEN finding: rendered worst-case ratio is below WCAG AA ${threshold}:1.`,
  };
}

export async function writeContrastEvidence(samples: ContrastSample[]) {
  const evidenceRoot = resolve(
    process.cwd(),
    '../../../Reports/launch-gate-evidence/2026-09-07/dashboard-phase-2/p2-12-authenticated-desktop-acceptance',
  );
  await mkdir(evidenceRoot, { recursive: true });
  const rows = samples.map(
    (sample) =>
      `| ${sample.theme} | \`${sample.route}\` | ${sample.label} | \`${sample.foreground}\` | ${sample.backgrounds.map((value) => `\`${value}\``).join('<br>')} | ${sample.ratio.toFixed(2)}:1 | ${sample.threshold}:1 | ${sample.pass ? 'pass' : 'finding'} | ${sample.disposition} |`,
  );
  const findings = samples.filter(({ pass }) => !pass);
  const markdown = `# P2.12 computed contrast results\n\nGenerated from rendered Chromium computed styles at 1440×900, device scale factor 1. Transparent colors are alpha-composited. When a rendered background includes a CSS gradient, every computed endpoint is evaluated and the lowest ratio is retained.\n\nThresholds: 4.5:1 normal text, 3:1 large text, and 3:1 essential non-text.\n\n| Theme | Route | Occurrence | Foreground/control | Rendered background candidates | Worst ratio | Threshold | Result | Disposition |\n| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |\n${rows.join('\n')}\n\n## Findings\n\n${findings.length === 0 ? 'No nonzero findings.' : findings.map((finding, index) => `${index + 1}. **${finding.theme} ${finding.route} — ${finding.label}:** ${finding.disposition}`).join('\n')}\n`;
  await writeFile(resolve(evidenceRoot, 'computed-contrast-results.md'), markdown, 'utf8');
}
