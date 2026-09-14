import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { appendFileSync, readdirSync } from 'node:fs';

import {
  classifyP112BrowserRequest,
  dispositionP112AxeFindings,
  findPrivacyLeak,
  isExpectedP112MissingDocumentConsole,
  isExpectedP112RouteErrorConsole,
  isP112ExpectedClientNavigationAbort,
  normalizeP112Request,
  parseP112RobotsMetadata,
  resolveP112Redirect,
  p112DestinationProbeStrategy,
} from '../../scripts/p1-12-acceptance/browser-contract';
import {
  P112_TIER_A_CLIENT_JOURNEYS,
  P112_TIER_A_ROUTES,
  P112_TIER_A_RENDERED_CASES,
  P112_REQUIRED_SITEMAP_PATHS,
  P112_PAGE_PATHS_BY_STATE,
  P112_PAGE_QUERIES_BY_STATE,
  type TierARoute,
} from '../../scripts/p1-12-acceptance/tier-a-manifest';
import { normalizeP112Canonical } from '../../scripts/p1-12-acceptance/canonical';
import { findP112ThemeRoleMismatches } from '../../scripts/p1-12-acceptance/theme';
import { auditP112RenderedContrast } from '../../scripts/p1-12-acceptance/contrast';
import {
  isP112DeclarativePrefetch,
  isP112ExpectedBrowserPrefetchAbort,
  isP112ExpectedSuppressedPrefetchConsoleError,
} from '../../scripts/p1-12-acceptance/prefetch';

type Theme = 'light' | 'dark';
const activeProfile = process.env.P112_EVIDENCE_PROFILE ?? 'production';
const activeStateId = process.env.P112_EVIDENCE_STATE_ID;

function filesUnder(root: string, prefix: string): string[] {
  try {
    return (readdirSync(root, { recursive: true, encoding: 'utf8' }) as string[])
      .filter((entry) => /\.[A-Za-z0-9]+$/u.test(entry))
      .map((entry) => `${prefix}/${entry.replaceAll('\\', '/')}`);
  } catch {
    return [];
  }
}

const REVIEWED_STATIC_PATHS = new Set([...filesUnder('public', '')]);

function projectTheme(testInfo: TestInfo): Theme {
  const theme = testInfo.project.metadata.p112Theme;
  if (theme !== 'light' && theme !== 'dark') throw new Error('Missing P1.12 project theme');
  return theme;
}

async function primeEnglishTheme(page: Page, theme: Theme): Promise<void> {
  await page
    .context()
    .addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: 'http://127.0.0.1:3001', sameSite: 'Lax' },
    ]);
  await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function expectNoOverflowOrBrokenImages(page: Page): Promise<void> {
  const documentSize = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentSize.scrollWidth, 'document horizontal overflow').toBeLessThanOrEqual(
    documentSize.clientWidth,
  );
  const clipped = await page
    .locator('header, footer, main > *, main form')
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName.toLowerCase(), left: rect.left, right: rect.right };
        })
        .filter(({ left, right }) => left < -1 || right > document.documentElement.clientWidth + 1),
    );
  expect(clipped, 'shell or primary content clipped horizontally').toEqual([]);

  const requiredControls = await page
    .locator('a[href]:visible, button:visible, input:visible, select:visible, textarea:visible')
    .evaluateAll((elements) =>
      elements.map((element, index) => {
        const control = element as HTMLElement;
        const rect = control.getBoundingClientRect();
        return {
          index,
          tag: control.tagName.toLowerCase(),
          ariaLabel: control.getAttribute('aria-label'),
          left: rect.left,
          right: rect.right,
          width: rect.width,
          scrollWidth: control.scrollWidth,
          clientWidth: control.clientWidth,
        };
      }),
    );
  expect(
    requiredControls.filter(
      ({ left, right, width, scrollWidth, clientWidth }) =>
        width <= 0 ||
        left < -1 ||
        right > documentSize.clientWidth + 1 ||
        scrollWidth > clientWidth + 1,
    ),
    'required control or control text clipped',
  ).toEqual([]);

  const requiredBodyDefects = await page
    .locator(
      'main :is(h1,h2,h3,h4,h5,h6,p,li,dt,dd,th,td,label,legend,a,button,input,select,textarea):visible',
    )
    .evaluateAll((elements) => {
      const defects: string[] = [];
      const perceptible = (element: Element) => {
        for (
          let node: Element | null = element;
          node && node !== document.body;
          node = node.parentElement
        ) {
          const style = getComputedStyle(node);
          if (
            Number.parseFloat(style.opacity) === 0 ||
            node.getAttribute('aria-hidden') === 'true' ||
            node.hasAttribute('inert')
          )
            return false;
        }
        const slide = element.closest('.swiper-slide');
        const viewport = slide?.closest('.swiper');
        if (slide && viewport) {
          const slideBox = slide.getBoundingClientRect();
          const viewportBox = viewport.getBoundingClientRect();
          if (slideBox.right <= viewportBox.left + 1 || slideBox.left >= viewportBox.right - 1)
            return false;
        }
        return true;
      };
      const leaves = elements.filter(
        (element) =>
          perceptible(element) &&
          !elements.some(
            (other) => other !== element && element.contains(other) && perceptible(other),
          ),
      );
      const clippedByAncestor = (element: Element) => {
        const rect = element.getBoundingClientRect();
        for (
          let parent = element.parentElement;
          parent && parent !== document.body;
          parent = parent.parentElement
        ) {
          const style = getComputedStyle(parent);
          const box = parent.getBoundingClientRect();
          if (
            /hidden|clip|auto|scroll/u.test(style.overflowX) &&
            (rect.left < box.left - 1 || rect.right > box.right + 1)
          )
            return true;
          if (
            /hidden|clip|auto|scroll/u.test(style.overflowY) &&
            (rect.top < box.top - 1 || rect.bottom > box.bottom + 1)
          )
            return true;
        }
        return false;
      };
      const identity = (element: Element, index: number) => {
        const classes = [...element.classList]
          .filter((value) => /^[A-Za-z0-9_-]+$/u.test(value))
          .slice(0, 3)
          .join('.');
        return `${index}:${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
      };
      leaves.forEach((element, index) => {
        if (clippedByAncestor(element)) defects.push(`clip:${identity(element, index)}`);
      });
      const fragments = (element: Element) =>
        [...element.getClientRects()].filter(({ width, height }) => width > 0 && height > 0);
      const isPasswordComposite = (first: Element, second: Element) => {
        if (first.parentElement !== second.parentElement) return false;
        const input =
          first.tagName === 'INPUT' ? first : second.tagName === 'INPUT' ? second : null;
        const button =
          first.tagName === 'BUTTON' ? first : second.tagName === 'BUTTON' ? second : null;
        return (
          input instanceof HTMLInputElement &&
          button instanceof HTMLButtonElement &&
          (input.type === 'password' || input.type === 'text') &&
          /^(?:show|hide) password$/iu.test(button.getAttribute('aria-label') ?? '')
        );
      };
      for (let left = 0; left < leaves.length; left += 1)
        for (let right = left + 1; right < leaves.length; right += 1) {
          if (isPasswordComposite(leaves[left]!, leaves[right]!)) continue;
          const overlaps = fragments(leaves[left]!).some((a) =>
            fragments(leaves[right]!).some(
              (b) =>
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
            ),
          );
          if (overlaps)
            defects.push(
              `overlap:${identity(leaves[left]!, left)}:${identity(leaves[right]!, right)}`,
            );
        }
      return defects;
    });
  expect(requiredBodyDefects, 'required body text clipped or overlapped').toEqual([]);

  const focusable = page.locator(
    'a[href]:visible,button:visible,input:visible,select:visible,textarea:visible',
  );
  const focusDefects: string[] = [];
  for (let index = 0; index < (await focusable.count()); index += 1) {
    const control = focusable.nth(index);
    await control.focus();
    if (
      await control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
        const outlineOffset = Number.parseFloat(style.outlineOffset) || 0;
        const spread = Math.max(outlineWidth + outlineOffset, 0);
        for (
          let parent = element.parentElement;
          parent && parent !== document.body;
          parent = parent.parentElement
        ) {
          const parentStyle = getComputedStyle(parent);
          const box = parent.getBoundingClientRect();
          if (
            /hidden|clip/u.test(`${parentStyle.overflowX} ${parentStyle.overflowY}`) &&
            (rect.left - spread < box.left - 1 ||
              rect.right + spread > box.right + 1 ||
              rect.top - spread < box.top - 1 ||
              rect.bottom + spread > box.bottom + 1)
          )
            return true;
        }
        return (
          rect.left - spread < -1 || rect.right + spread > document.documentElement.clientWidth + 1
        );
      })
    ) {
      const identity = await control.evaluate((element) => {
        const classes = [...element.classList]
          .filter((value) => /^[A-Za-z0-9_-]+$/u.test(value))
          .slice(0, 3)
          .join('.');
        return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
      });
      focusDefects.push(`${index}:${identity}`);
    }
  }
  expect(focusDefects, 'focus ring clipped').toEqual([]);
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  // Resetting scroll expands the integrated topbar over 420 ms. Audit the
  // stable layout rather than treating an in-flight transition as overlap.
  await page.waitForTimeout(450);

  const overlaps = await page
    .locator('a[href]:visible, button:visible, input:visible, select:visible, textarea:visible')
    .evaluateAll((elements) => {
      const rectangles = elements.map((element) =>
        [...element.getClientRects()].filter(({ width, height }) => width > 0 && height > 0),
      );
      const pairs: string[] = [];
      const isPasswordComposite = (first: Element, second: Element) => {
        if (first.parentElement !== second.parentElement) return false;
        const input =
          first.tagName === 'INPUT' ? first : second.tagName === 'INPUT' ? second : null;
        const button =
          first.tagName === 'BUTTON' ? first : second.tagName === 'BUTTON' ? second : null;
        return (
          input instanceof HTMLInputElement &&
          button instanceof HTMLButtonElement &&
          (input.type === 'password' || input.type === 'text') &&
          /^(?:show|hide) password$/iu.test(button.getAttribute('aria-label') ?? '')
        );
      };
      for (let left = 0; left < rectangles.length; left += 1) {
        for (let right = left + 1; right < rectangles.length; right += 1) {
          if (isPasswordComposite(elements[left]!, elements[right]!)) continue;
          if (
            elements[left]!.contains(elements[right]!) ||
            elements[right]!.contains(elements[left]!)
          )
            continue;
          const intersects = rectangles[left]!.some((a) =>
            rectangles[right]!.some(
              (b) =>
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
            ),
          );
          if (intersects) {
            pairs.push(`${left}:${right}`);
          }
        }
      }
      return pairs;
    });
  expect(overlaps, 'independent required controls do not overlap').toEqual([]);

  const broken = await page.locator('img').evaluateAll((images) =>
    images
      .filter((image): image is HTMLImageElement => {
        const style = getComputedStyle(image);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((image) => ({
        alt: image.alt,
        source: image.currentSrc || image.src,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
      }))
      .filter(({ complete, naturalWidth }) => !complete || naturalWidth === 0),
  );
  expect(broken, 'visible broken images').toEqual([]);
}

async function expectAcceptedShellAndTheme(page: Page, theme: Theme): Promise<void> {
  const themeToggle = page.locator('.public-theme-toggle');
  const localeControl = page.getByRole('button', { name: /language/iu }).first();
  await expect(themeToggle).toBeVisible();
  await expect(localeControl).toBeVisible();
  await expect(localeControl).toContainText('English');

  const tokens = await page
    .locator('.site-public')
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        canvas: style.getPropertyValue('--public-canvas').trim(),
        text: style.getPropertyValue('--public-text-primary').trim(),
        cta: style.getPropertyValue('--public-cta-background').trim(),
        focus: style.getPropertyValue('--public-focus-ring').trim(),
        font: style.fontFamily.toLowerCase(),
      };
    });
  expect(tokens.canvas).not.toBe('');
  expect(tokens.text).not.toBe('');
  expect(tokens.cta).toBe(theme === 'light' ? '#b9380f' : '#ff7043');
  const setupPage = (await page.locator('.setup-page').count()) === 1;
  expect(tokens.focus).toBe(setupPage ? '#ff5722' : theme === 'light' ? '#b9380f' : '#ff865f');
  expect(tokens.font).toContain('geist');
  await expect(page.locator('.public-theme-toggle__icon--sun')).toBeVisible({
    visible: theme === 'light',
  });
  await expect(page.locator('.public-theme-toggle__icon--moon')).toBeVisible({
    visible: theme === 'dark',
  });

  await themeToggle.focus();
  const focusStyle = await themeToggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
  });
  expect(
    focusStyle.outlineWidth !== '0px' || focusStyle.boxShadow !== 'none',
    'theme control has a visible focus ring',
  ).toBe(true);

  const visualSectionTops = await page
    .locator('main section:visible')
    .evaluateAll((sections) =>
      sections
        .filter((section) => !section.parentElement?.closest('section'))
        .map((section) => section.getBoundingClientRect().top + window.scrollY),
    );
  expect(
    visualSectionTops.every(
      (top, index) => index === 0 || top >= visualSectionTops[index - 1]! - 1,
    ),
    `visual section order follows accepted DOM order: ${JSON.stringify(visualSectionTops)}`,
  ).toBe(true);
}

async function expectInternalDestinations(
  page: Page,
  route: TierARoute,
  stateId: string,
): Promise<void> {
  const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
    anchors
      .filter((anchor) => !anchor.hasAttribute('download'))
      .map((anchor) => anchor.getAttribute('href'))
      .filter((href): href is string => Boolean(href))
      .filter(
        (href) => !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:'),
      ),
  );
  for (const href of [...new Set(hrefs)]) {
    const target = new URL(href, page.url());
    expect(target.origin, `internal destination ${href}`).toBe('http://127.0.0.1:3001');
    expect(
      route.enabledDestinations.some(
        (destination) => new URL(destination, page.url()).pathname === target.pathname,
      ),
      `route destination declaration ${target.pathname}`,
    ).toBe(true);
    const decision = classifyP112BrowserRequest({
      method: 'GET',
      url: target.toString(),
      stateId,
      allowedPagePathsByState: P112_PAGE_PATHS_BY_STATE,
      allowedPageQueriesByState: P112_PAGE_QUERIES_BY_STATE,
    });
    expect(decision.allowed, `destination request allowlist ${target.pathname}`).toBe(true);
    if (p112DestinationProbeStrategy(stateId, target.pathname) === 'declaration') continue;
    let requestedUrl = target.href;
    let response = await page.request.get(requestedUrl, { maxRedirects: 0 });
    for (let hop = 0; response.status() >= 300 && response.status() < 400; hop += 1) {
      expect(hop, 'bounded destination redirects').toBeLessThan(5);
      requestedUrl = resolveP112Redirect(response.headers()['location'] ?? '', requestedUrl);
      response = await page.request.get(requestedUrl, { maxRedirects: 0 });
    }
    expect(new URL(response.url()).origin, `destination final origin ${target.pathname}`).toBe(
      'http://127.0.0.1:3001',
    );
    expect(response.status(), `enabled destination ${target.pathname}`).toBeGreaterThanOrEqual(200);
    expect(response.status(), `enabled destination ${target.pathname}`).toBeLessThan(300);
  }
}

async function expectHeadingOrder(page: Page): Promise<void> {
  const levels = await page.locator('h1,h2,h3,h4,h5,h6').evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((node) => Number(node.tagName.slice(1))),
  );
  expect(levels[0], 'first visible heading is h1').toBe(1);
  for (let index = 1; index < levels.length; index += 1) {
    expect(levels[index]! - levels[index - 1]!, 'heading levels do not skip').toBeLessThanOrEqual(
      1,
    );
  }
}

/** The post-navigation gate is deliberately shared: a client transition is not a reduced check. */
async function expectCompleteP112HtmlGate(
  page: Page,
  route: TierARoute,
  stateId: string,
  theme: Theme,
  testInfo: TestInfo,
  telemetry: {
    runtimeProblems: readonly string[];
    rejectedRequests: readonly ReturnType<typeof normalizeP112Request>[];
    expectedUrl?: string;
  },
): Promise<void> {
  await settle(page);
  expect(page.url(), 'exact final origin, path, and query').toBe(
    new URL(telemetry.expectedUrl ?? route.path, 'http://127.0.0.1:3001').href,
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveClass(new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`, 'u'));
  expect(await page.evaluate(() => document.fonts.status)).toBe('loaded');
  await expect(page).toHaveTitle(route.expectedTitle);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    route.expectedDescription,
  );
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  expect(
    await page.locator('.site-public').count(),
    'accepted public shell wrappers',
  ).toBeGreaterThanOrEqual(3);
  expect(
    await page
      .locator('header[role="banner"], main, footer')
      .evaluateAll((nodes) => nodes.map((node) => node.tagName.toLowerCase())),
  ).toEqual(['header', 'main', 'footer']);
  await expect(page.locator('h1:visible')).toHaveCount(route.requiresMainHeading ? 1 : 0);
  await expect(page.locator('a.skip-link')).toHaveText('Skip to main content');
  await expectHeadingOrder(page);
  await page.locator('a.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  const canonical = page.locator('link[rel="canonical"]');
  if (route.canonical === null) await expect(canonical).toHaveCount(0);
  else {
    await expect(canonical).toHaveCount(1);
    expect(normalizeP112Canonical((await canonical.getAttribute('href')) ?? '')).toBe(
      route.canonical,
    );
  }
  const robots = page.locator('meta[name="robots"]');
  const robotsMetadata = await robots.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('content') ?? ''),
  );
  expect(parseP112RobotsMetadata(robotsMetadata, route.expectedStatus === 404)).toEqual({
    index: !route.noindex,
    follow: !route.noindex,
  });

  const og = page.locator('meta[property^="og:"]');
  if (route.og === 'prohibited') await expect(og).toHaveCount(0);
  else {
    const ogTitle = page.locator('meta[property="og:title"]');
    const expectedOgTitle = new Set(['authority-ready', 'blog-ready', 'knowledge-base-ready']).has(
      route.id,
    )
      ? await page.locator('h1:visible').innerText()
      : await page.title();
    await expect(ogTitle).toHaveAttribute('content', expectedOgTitle);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      route.expectedDescription,
    );
    if (route.canonical) {
      const ogUrl = page.locator('meta[property="og:url"]');
      await expect(ogUrl).toHaveCount(1);
      expect(normalizeP112Canonical((await ogUrl.getAttribute('content')) ?? '')).toBe(
        route.canonical,
      );
    }
  }
  const jsonLd = page.locator('script[type="application/ld+json"]');
  await expect(jsonLd).toHaveCount(route.jsonLdCount);
  const jsonTypes: string[] = [];
  for (const raw of await jsonLd.allTextContents()) {
    const value = JSON.parse(raw) as Record<string, unknown>;
    expect(value['@context']).toBe('https://schema.org');
    expect(typeof value['@type']).toBe('string');
    jsonTypes.push(String(value['@type']));
    if (value['@type'] === 'Article') {
      expect(value['headline']).toBe(await page.locator('h1:visible').innerText());
      expect(value['description']).toBe(
        await page.locator('meta[name="description"]').getAttribute('content'),
      );
      expect(value['url']).toBe(new URL(route.canonical!, 'https://mandoob.ae').href);
    }
    if (value['@type'] === 'FAQPage') {
      expect(Array.isArray(value['mainEntity'])).toBe(true);
      expect((value['mainEntity'] as unknown[]).length).toBeGreaterThan(0);
    }
    expect(findPrivacyLeak(raw)).toBeNull();
  }
  expect(jsonTypes.sort()).toEqual([...route.jsonLdTypes].sort());

  await expect(
    page.locator(
      '[aria-busy="true"]:visible, .animate-pulse:visible, [class*="skeleton" i]:visible',
    ),
  ).toHaveCount(0);
  const themeSurface = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, color: style.color, font: style.fontFamily };
  });
  expect(themeSurface.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(themeSurface.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(themeSurface.font.toLowerCase()).toContain('geist');
  const themeSnapshots = await page.evaluate(
    async ({ requestedTheme, exemptions }) => {
      const root = document.documentElement;
      const site = document.querySelector('.site-public')!;
      const nodes = [
        ...document.querySelectorAll('.site-public,header,footer,main,main section'),
      ].filter((element) => {
        const style = getComputedStyle(element);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          !exemptions.some((selector) => element.matches(selector) || element.closest(selector))
        );
      });
      const roles = () => {
        const style = getComputedStyle(site);
        return {
          canvas: style.getPropertyValue('--public-canvas').trim(),
          surface: style.getPropertyValue('--public-surface').trim(),
          elevated: style.getPropertyValue('--public-surface-elevated').trim(),
          text: style.getPropertyValue('--public-text-primary').trim(),
          muted: style.getPropertyValue('--public-text-muted').trim(),
          tint: style.getPropertyValue('--zinc-50').trim(),
          body: style.getPropertyValue('--zinc-900').trim(),
        };
      };
      const styles = () =>
        nodes.map((element, index) => {
          const style = getComputedStyle(element);
          const classes = [...element.classList]
            .filter((value) => /^[A-Za-z0-9_-]+$/u.test(value))
            .slice(0, 3)
            .join('.');
          return {
            identity: `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}:${index}`,
            background: style.backgroundColor,
            color: style.color,
          };
        });
      const currentRoles = roles();
      const currentStyles = styles();
      const before = root.className;
      const storedTheme = localStorage.getItem('theme');
      localStorage.setItem('theme', requestedTheme === 'light' ? 'dark' : 'light');
      root.classList.toggle('dark', requestedTheme === 'light');
      root.classList.toggle('light', requestedTheme === 'dark');
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      if (!root.classList.contains(requestedTheme === 'light' ? 'dark' : 'light'))
        throw new Error('P1.12 opposite theme did not settle');
      const oppositeRoles = roles();
      const oppositeStyles = styles();
      if (storedTheme === null) localStorage.removeItem('theme');
      else localStorage.setItem('theme', storedTheme);
      root.className = before;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      return { currentRoles, oppositeRoles, currentStyles, oppositeStyles };
    },
    { requestedTheme: theme, exemptions: route.themeSurfaceExemptions },
  );
  const wrongThemeSurfaces = findP112ThemeRoleMismatches(
    themeSnapshots.currentRoles,
    themeSnapshots.oppositeRoles,
    themeSnapshots.currentStyles,
    themeSnapshots.oppositeStyles,
  );
  expect(wrongThemeSurfaces, 'manifest-backed theme surface palette').toEqual([]);
  const sectionNodes = [];
  for (const selector of route.sections) {
    const section = page.locator(selector);
    await expect(section, `section identity ${selector}`).toHaveCount(1);
    await expect(section).toBeVisible();
    sectionNodes.push(await section.elementHandle());
  }
  for (let index = 1; index < sectionNodes.length; index += 1) {
    expect(
      await sectionNodes[index - 1]!.evaluate(
        (left, right) =>
          Boolean(left.compareDocumentPosition(right as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
        sectionNodes[index],
      ),
      'section contract follows DOM order',
    ).toBe(true);
  }
  await expectAcceptedShellAndTheme(page, theme);
  await expectNoOverflowOrBrokenImages(page);
  await expectInternalDestinations(page, route, stateId);
  const axe = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    axe.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);
  const lower = dispositionP112AxeFindings(
    axe.violations.filter(({ impact }) => impact !== 'critical' && impact !== 'serious'),
  );
  await testInfo.attach('axe-lower-severity-findings-shared-gate.json', {
    body: JSON.stringify(lower, null, 2),
    contentType: 'application/json',
  });
  expect(lower, 'all retained moderate/minor findings have must-fix disposition').toEqual([]);
  const contrast = await auditP112RenderedContrast(page, {
    route: route.path,
    stateId,
    profile: activeProfile,
    project: testInfo.project.name,
  });
  await testInfo.attach('contrast-ratios.json', {
    body: JSON.stringify(contrast, null, 2),
    contentType: 'application/json',
  });
  const contrastLogPath = process.env.P112_CONTRAST_LOG_PATH;
  if (contrastLogPath)
    appendFileSync(
      contrastLogPath,
      `${contrast.map((record) => JSON.stringify(record)).join('\n')}\n`,
      'utf8',
    );
  expect(contrast.length, 'numeric rendered contrast samples').toBeGreaterThanOrEqual(4);
  expect(
    contrast.filter((record) => record.result === 'FAIL'),
    'rendered contrast ratios',
  ).toEqual([]);
  const retained = await page.evaluate(() => ({
    text: document.body.innerText,
    attributes: [...document.querySelectorAll('[href],[src],[action],[value]')]
      .flatMap((node) =>
        ['href', 'src', 'action', 'value'].map((name) => node.getAttribute(name) ?? ''),
      )
      .join('\n'),
  }));
  expect(findPrivacyLeak(page.url())).toBeNull();
  expect(findPrivacyLeak(retained.text)).toBeNull();
  expect(findPrivacyLeak(retained.attributes)).toBeNull();
  expect(telemetry.rejectedRequests).toEqual([]);
  expect(telemetry.runtimeProblems).toEqual([]);
}

for (const route of P112_TIER_A_RENDERED_CASES.filter(
  ({ profile, stateId }) => profile === activeProfile && stateId === activeStateId,
)) {
  test(`${route.id} — ${route.path}`, async ({ page }, testInfo) => {
    const theme = projectTheme(testInfo);
    const stateId = route.stateId;
    const runtimeProblems: string[] = [];
    const rejectedRequests: ReturnType<typeof normalizeP112Request>[] = [];
    const suppressedPrefetchUrls = new Set<string>();

    await page.route('**/*', async (intercepted) => {
      const request = intercepted.request();
      const url = request.url();
      const input = {
        method: request.method(),
        url,
        stateId,
        evidenceProfile: activeProfile,
        allowedPagePathsByState: P112_PAGE_PATHS_BY_STATE,
        allowedPageQueriesByState: P112_PAGE_QUERIES_BY_STATE,
        reviewedStaticPaths: REVIEWED_STATIC_PATHS,
        reviewedNextStaticRoot: '.next/static',
      };
      const decision = classifyP112BrowserRequest(input);
      if (
        decision.allowed &&
        isP112DeclarativePrefetch({
          method: request.method(),
          url,
          stateId,
          resourceType: request.resourceType(),
          headers: request.headers(),
        })
      ) {
        suppressedPrefetchUrls.add(url);
        await intercepted.abort('blockedbyclient');
      } else if (decision.allowed) await intercepted.continue();
      else {
        rejectedRequests.push(
          normalizeP112Request(input.method, url, stateId, decision.queryShape),
        );
        await intercepted.abort('blockedbyclient');
      }
    });
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !isP112ExpectedSuppressedPrefetchConsoleError({
          text: message.text(),
          url: message.location().url,
          suppressedUrls: suppressedPrefetchUrls,
        }) &&
        !isExpectedP112MissingDocumentConsole({
          text: message.text(),
          url: message.location().url,
          routePath: route.path,
          expectedStatus: route.expectedStatus,
        }) &&
        !isExpectedP112RouteErrorConsole({
          stateId,
          evidenceProfile: activeProfile,
          text: message.text(),
          url: message.location().url,
        })
      )
        runtimeProblems.push(`console:${findPrivacyLeak(message.text()) ?? 'error'}`);
    });
    page.on('pageerror', (error) =>
      runtimeProblems.push(`pageerror:${findPrivacyLeak(error.message) ?? error.name}`),
    );
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? '';
      const rejected = rejectedRequests.some(({ method, origin, path }) => {
        const normalized = normalizeP112Request(request.method(), request.url(), stateId);
        return (
          normalized.method === method && normalized.origin === origin && normalized.path === path
        );
      });
      const requestUrl = request.url();
      const input = {
        method: request.method(),
        url: requestUrl,
        stateId,
        evidenceProfile: activeProfile,
        resourceType: request.resourceType(),
        headers: request.headers(),
      };
      const allowed = classifyP112BrowserRequest({
        ...input,
        allowedPagePathsByState: P112_PAGE_PATHS_BY_STATE,
        allowedPageQueriesByState: P112_PAGE_QUERIES_BY_STATE,
        reviewedStaticPaths: REVIEWED_STATIC_PATHS,
        reviewedNextStaticRoot: '.next/static',
      }).allowed;
      const expectedPrefetchAbort = isP112ExpectedBrowserPrefetchAbort({
        ...input,
        allowed,
        failure,
      });
      if (!rejected && !suppressedPrefetchUrls.has(requestUrl) && !expectedPrefetchAbort) {
        const normalized = normalizeP112Request(request.method(), requestUrl, stateId);
        runtimeProblems.push(
          `requestfailed:${request.resourceType()}:${normalized.path}:${(findPrivacyLeak(failure) ?? failure) || 'failure'}`,
        );
      }
    });
    page.on('response', (response) => {
      if (response.status() >= 500) runtimeProblems.push(`response: ${response.status()}`);
    });

    await primeEnglishTheme(page, theme);
    const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), 'document status').toBe(route.expectedStatus);

    if (route.kind === 'generated') {
      expect(response?.headers()['content-type']).toMatch(
        route.path.endsWith('.xml') ? /(?:xml|text\/plain)/u : /text\/plain/u,
      );
      const body = await response!.text();
      expect(findPrivacyLeak(body)).toBeNull();
      if (route.id === 'robots') {
        expect(body.split(/\r?\n/u).filter(Boolean)).toEqual([
          'User-Agent: *',
          'Allow: /',
          'Disallow: /api/',
          'Host: https://mandoob.ae',
          'Sitemap: https://mandoob.ae/sitemap.xml',
        ]);
      } else {
        const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]!);
        expect(locations.map((location) => new URL(location).pathname).sort()).toEqual(
          [...P112_REQUIRED_SITEMAP_PATHS].sort(),
        );
        for (const location of locations) {
          const parsed = new URL(location);
          expect(parsed.origin).toBe('https://mandoob.ae');
          expect(parsed.search).toBe('');
          expect(parsed.hash).toBe('');
          if (p112DestinationProbeStrategy(stateId, parsed.pathname) === 'http') {
            const destination = await page.request.get(
              new URL(parsed.pathname, 'http://127.0.0.1:3001').href,
              { maxRedirects: 0 },
            );
            expect(new URL(destination.url()).origin).toBe('http://127.0.0.1:3001');
            expect(
              destination.status(),
              `${parsed.pathname} rejects redirects`,
            ).toBeGreaterThanOrEqual(200);
            expect(destination.status(), `${parsed.pathname} rejects redirects`).toBeLessThan(300);
          } else {
            const declared = P112_TIER_A_ROUTES.find(
              (candidate) => candidate.path === parsed.pathname,
            );
            expect(declared?.expectedStatus, `${parsed.pathname} declaration status`).toBe(200);
            expect(declared?.canonical, `${parsed.pathname} declaration redirect policy`).toBe(
              parsed.pathname,
            );
          }
        }
        expect(new Set(locations).size).toBe(locations.length);
      }
      expect(rejectedRequests).toEqual([]);
      expect(runtimeProblems).toEqual([]);
      return;
    }

    await expectCompleteP112HtmlGate(page, route, stateId, theme, testInfo, {
      runtimeProblems,
      rejectedRequests,
    });
  });
}

for (const journey of P112_TIER_A_CLIENT_JOURNEYS) {
  if (activeProfile !== 'production' || journey.stateId !== activeStateId) continue;
  test(`client navigation — ${journey.id}`, async ({ page }, testInfo) => {
    const rejectedRequests: ReturnType<typeof normalizeP112Request>[] = [];
    const suppressedPrefetchUrls = new Set<string>();
    const runtimeProblems: string[] = [];
    await page.route('**/*', async (intercepted) => {
      const request = intercepted.request();
      const input = {
        method: request.method(),
        url: request.url(),
        stateId: journey.stateId,
        evidenceProfile: activeProfile,
        allowedPagePathsByState: P112_PAGE_PATHS_BY_STATE,
        allowedPageQueriesByState: P112_PAGE_QUERIES_BY_STATE,
        reviewedStaticPaths: REVIEWED_STATIC_PATHS,
        reviewedNextStaticRoot: '.next/static',
      };
      const decision = classifyP112BrowserRequest(input);
      if (
        decision.allowed &&
        isP112DeclarativePrefetch({
          method: request.method(),
          url: request.url(),
          stateId: journey.stateId,
          resourceType: request.resourceType(),
          headers: request.headers(),
        })
      ) {
        suppressedPrefetchUrls.add(input.url);
        await intercepted.abort('blockedbyclient');
      } else if (decision.allowed) await intercepted.continue();
      else {
        rejectedRequests.push(
          normalizeP112Request(input.method, input.url, input.stateId, decision.queryShape),
        );
        await intercepted.abort('blockedbyclient');
      }
    });
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !isP112ExpectedSuppressedPrefetchConsoleError({
          text: message.text(),
          url: message.location().url,
          suppressedUrls: suppressedPrefetchUrls,
        })
      )
        runtimeProblems.push(`console:${findPrivacyLeak(message.text()) ?? 'error'}`);
    });
    page.on('pageerror', (error) =>
      runtimeProblems.push(`pageerror:${findPrivacyLeak(error.message) ?? error.name}`),
    );
    page.on('requestfailed', (request) => {
      const normalized = normalizeP112Request(request.method(), request.url(), journey.stateId);
      const rejected = rejectedRequests.some(
        ({ method, origin, path }) =>
          method === normalized.method && origin === normalized.origin && path === normalized.path,
      );
      const failure = request.failure()?.errorText ?? '';
      const input = {
        method: request.method(),
        url: request.url(),
        stateId: journey.stateId,
        evidenceProfile: activeProfile,
        resourceType: request.resourceType(),
        headers: request.headers(),
      };
      const allowed = classifyP112BrowserRequest({
        ...input,
        allowedPagePathsByState: P112_PAGE_PATHS_BY_STATE,
        allowedPageQueriesByState: P112_PAGE_QUERIES_BY_STATE,
        reviewedStaticPaths: REVIEWED_STATIC_PATHS,
        reviewedNextStaticRoot: '.next/static',
      }).allowed;
      const expectedPrefetchAbort = isP112ExpectedBrowserPrefetchAbort({
        ...input,
        allowed,
        failure,
      });
      const expectedNavigationAbort = isP112ExpectedClientNavigationAbort({
        ...input,
        allowed,
        failure,
        targetPath: journey.to,
      });
      if (
        !rejected &&
        !suppressedPrefetchUrls.has(request.url()) &&
        !expectedPrefetchAbort &&
        !expectedNavigationAbort
      )
        runtimeProblems.push(
          `requestfailed:${request.resourceType()}:${normalized.path}:${(findPrivacyLeak(failure) ?? failure) || 'failure'}`,
        );
    });
    page.on('response', (response) => {
      if (response.status() >= 500) runtimeProblems.push(`response:${response.status()}`);
    });
    await primeEnglishTheme(page, projectTheme(testInfo));
    await page.goto(journey.from);
    await settle(page);
    const link = page.locator(`a[href="${journey.to}"]`).first();
    await expect(link).toBeVisible();
    await Promise.all([
      page.waitForURL((url) => url.href === new URL(journey.to, 'http://127.0.0.1:3001').href),
      link.click(),
    ]);
    expect(page.url()).toBe(new URL(journey.to, 'http://127.0.0.1:3001').href);
    await expect(page.getByRole('main')).toBeVisible();
    const targetPath = new URL(journey.to, 'http://127.0.0.1:3001').pathname;
    const route = P112_TIER_A_ROUTES.find(
      (candidate) =>
        candidate.kind === 'html' &&
        new URL(candidate.path, 'http://127.0.0.1:3001').pathname === targetPath,
    );
    expect(route, `declared destination contract for ${targetPath}`).toBeDefined();
    await expect(page.locator(route!.sections[0]!)).toHaveCount(1);
    await expect(page.locator('.public-content-loading:visible')).toHaveCount(0);
    await settle(page);
    const status = await page.request.get(new URL(targetPath, 'http://127.0.0.1:3001').href, {
      maxRedirects: 0,
    });
    expect(status.status()).toBe(route!.expectedStatus);
    await expectCompleteP112HtmlGate(
      page,
      route!,
      journey.stateId,
      projectTheme(testInfo),
      testInfo,
      {
        runtimeProblems,
        rejectedRequests,
        expectedUrl: journey.to,
      },
    );
    expect(rejectedRequests, 'client journey network policy').toEqual([]);
    expect(runtimeProblems, 'client journey runtime policy').toEqual([]);
  });
}
