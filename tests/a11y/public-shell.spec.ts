import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';

type Locale = 'en' | 'ar';
type Theme = 'light' | 'dark';

const matrix = [
  { viewport: { width: 390, height: 844 }, locale: 'en', theme: 'dark' },
  { viewport: { width: 768, height: 1024 }, locale: 'ar', theme: 'light' },
  { viewport: { width: 1024, height: 768 }, locale: 'en', theme: 'light' },
  { viewport: { width: 1440, height: 900 }, locale: 'ar', theme: 'dark' },
  { viewport: { width: 1920, height: 1080 }, locale: 'en', theme: 'dark' },
] as const;

const copy = {
  en: {
    dir: 'ltr',
    primaryNav: 'Primary navigation',
    mobileNav: 'Mobile navigation',
    menu: 'Navigation menu',
    open: 'Open menu',
    close: 'Close menu',
    skip: 'Skip to main content',
    language: /English.*Language/u,
    otherLanguage: 'العربية',
    nextTheme: { light: 'Use dark theme', dark: 'Use light theme' },
    navigation: ['Platform', 'Estimate', 'Customers', 'For PROs', 'Pricing'],
  },
  ar: {
    dir: 'rtl',
    primaryNav: 'التنقل الرئيسي',
    mobileNav: 'التنقل على الأجهزة المحمولة',
    menu: 'قائمة التنقل',
    open: 'فتح القائمة',
    close: 'إغلاق القائمة',
    skip: 'الانتقال إلى المحتوى الرئيسي',
    language: /العربية.*اللغة/u,
    otherLanguage: 'English',
    nextTheme: { light: 'استخدام المظهر الداكن', dark: 'استخدام المظهر الفاتح' },
    navigation: ['المنصة', 'تقدير التكلفة', 'العملاء', 'لمتخصصي العلاقات الحكومية', 'الأسعار'],
  },
} as const;

const navigationHrefs = ['/#services', '/estimate', '/#customers', '/pro', '/pricing'];
const shellDestinations = [
  '/',
  '/estimate',
  '/pro',
  '/pricing',
  '/login',
  '/apply',
  '/about',
  '/knowledge-base',
  '/contact',
  '/legal/privacy',
  '/legal/terms',
  '/legal/pdpl',
  '/legal/trust',
] as const;
const currentRouteCases = [
  { route: '/', currentIndex: 0 },
  { route: '/estimate', currentIndex: 1 },
  { route: '/pro', currentIndex: 3 },
  { route: '/pricing', currentIndex: 4 },
] as const;

declare global {
  interface Window {
    __shellThemeFrames?: string[];
  }
}

async function primeState(context: BrowserContext, page: Page, locale: Locale, theme: Theme) {
  await context.addCookies([
    { name: 'NEXT_LOCALE', value: locale, url: 'http://localhost:3001', sameSite: 'Lax' },
  ]);
  await page.addInitScript((persistedTheme) => {
    localStorage.setItem('theme', persistedTheme);
    window.__shellThemeFrames = [];
    const record = () => {
      if (document.documentElement) {
        window.__shellThemeFrames?.push(document.documentElement.className);
      }
    };
    new MutationObserver(record).observe(document, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });
    new PerformanceObserver((entries) => {
      if (entries.getEntriesByName('first-paint').length === 0) return;
      record();
      document.documentElement.dataset.firstPaintTheme =
        document.documentElement.classList.contains('dark')
          ? 'dark'
          : document.documentElement.classList.contains('light')
            ? 'light'
            : 'none';
      document.documentElement.dataset.themeTransitions =
        window.__shellThemeFrames?.join('|') ?? '';
    }).observe({ type: 'paint', buffered: true });
  }, theme);
}

function watchRuntime(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.origin === 'http://localhost:3001')
      problems.push(`requestfailed: ${url.pathname} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === 'http://localhost:3001' && response.status() >= 400)
      problems.push(`response: ${response.status()} ${url.pathname}`);
  });
  return problems;
}

async function expectNoShellOverflow(page: Page, dialogOpen = false) {
  const overflow = await page.evaluate((isDialogOpen) => {
    const viewportWidth = document.documentElement.clientWidth;
    const shell = [
      document.querySelector<HTMLElement>('header'),
      document.querySelector<HTMLElement>('footer'),
      ...(isDialogOpen ? [document.querySelector<HTMLElement>('.public-mobile-dialog')] : []),
    ].filter((element): element is HTMLElement => Boolean(element));
    return shell.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.getAttribute('role') ?? element.tagName.toLowerCase(),
        inlineOverflow: element.scrollWidth - element.clientWidth,
        left: Math.floor(rect.left),
        right: Math.ceil(rect.right - viewportWidth),
      };
    });
  }, dialogOpen);
  for (const entry of overflow) {
    expect(entry.inlineOverflow, `${entry.tag} internal overflow`).toBeLessThanOrEqual(0);
    expect(entry.left, `${entry.tag} left viewport bound`).toBeGreaterThanOrEqual(0);
    expect(entry.right, `${entry.tag} right viewport bound`).toBeLessThanOrEqual(0);
  }
}

async function expectNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, 'document horizontal overflow').toBeLessThanOrEqual(
    dimensions.clientWidth,
  );
}

async function expectLoadedShellImages(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const shellImages = page.locator('header.nav img, footer.footer img, .hero img');
  const imageCount = await shellImages.count();
  for (let index = 0; index < imageCount; index += 1)
    await shellImages.nth(index).scrollIntoViewIfNeeded();
  const checkedImages = await shellImages.evaluateAll((images) =>
    images
      .filter((image): image is HTMLImageElement => {
        const style = getComputedStyle(image);
        const rect = image.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
      })
      .map((image) => ({
        source: new URL(image.currentSrc || image.src, location.href).pathname,
        alt: image.alt,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
      })),
  );
  expect(
    checkedImages.filter(({ complete, naturalWidth }) => !complete || naturalWidth <= 0),
  ).toEqual([]);

  const heroBackground = await page.locator('.hero').evaluate(async (hero) => {
    const match = getComputedStyle(hero).backgroundImage.match(/url\(["']?(.*?)["']?\)/u);
    if (!match) return null;
    const image = new Image();
    image.src = match[1];
    if (!image.complete) await image.decode();
    return {
      source: new URL(image.src, location.href).pathname,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
    };
  });
  expect(heroBackground).toMatchObject({
    source: '/hero/skyline.jpg',
    complete: true,
  });
  expect(heroBackground?.naturalWidth ?? 0).toBeGreaterThan(0);
  test.info().annotations.push({
    type: 'shell images checked',
    description: JSON.stringify([
      ...checkedImages.map(({ source, alt }) => ({ source, alt })),
      { source: heroBackground?.source, kind: 'CSS background' },
    ]),
  });
}

async function expectVisibleTargetsAtLeast44(page: Page, scope: string) {
  const undersized = await page.locator(scope).evaluateAll((targets) =>
    targets
      .filter((target) => {
        const style = getComputedStyle(target);
        const rect = target.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0;
      })
      .map((target) => {
        const rect = target.getBoundingClientRect();
        return {
          name: target.getAttribute('aria-label') ?? target.textContent?.trim() ?? target.tagName,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44),
  );
  expect(undersized).toEqual([]);
}

async function contrastRatio(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const parse = (value: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const luminance = (rgb: number[]) =>
      rgb
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        })
        .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = parse(getComputedStyle(element).color);
    let background = parse(getComputedStyle(element).backgroundColor);
    for (
      let ancestor = element.parentElement;
      ancestor && background[3] < 255;
      ancestor = ancestor.parentElement
    ) {
      const layer = parse(getComputedStyle(ancestor).backgroundColor);
      const foregroundAlpha = background[3] / 255;
      const layerAlpha = layer[3] / 255;
      const outputAlpha = foregroundAlpha + layerAlpha * (1 - foregroundAlpha);
      if (outputAlpha === 0) continue;
      background = [
        ...background
          .slice(0, 3)
          .map(
            (channel, index) =>
              (channel * foregroundAlpha + layer[index] * layerAlpha * (1 - foregroundAlpha)) /
              outputAlpha,
          ),
        outputAlpha * 255,
      ];
    }
    const values = [luminance(foreground.slice(0, 3)), luminance(background.slice(0, 3))].sort(
      (a, b) => b - a,
    );
    return (values[0] + 0.05) / (values[1] + 0.05);
  });
}

for (const entry of matrix) {
  const label = `${entry.viewport.width}x${entry.viewport.height} ${entry.locale.toUpperCase()} ${entry.theme}`;
  test(`pairwise shell matrix — ${label}`, async ({ context, page }) => {
    test.setTimeout(90_000);
    const runtimeProblems = watchRuntime(page);
    await page.setViewportSize(entry.viewport);
    await page.emulateMedia({ colorScheme: entry.theme });
    await primeState(context, page, entry.locale, entry.theme);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('banner')).toBeVisible();
    await expectLoadedShellImages(page);
    const expected = copy[entry.locale];

    await expect(page.locator('html')).toHaveAttribute('lang', entry.locale);
    await expect(page.locator('html')).toHaveAttribute('dir', expected.dir);
    await expect(page.locator('html')).toHaveClass(
      new RegExp(`(?:^|\\s)${entry.theme}(?:\\s|$)`, 'u'),
    );
    await expect(page.locator('html')).toHaveAttribute('data-first-paint-theme', entry.theme);
    const firstPaintTheme = await page.locator('html').getAttribute('data-first-paint-theme');
    const themedFrames = ((await page.locator('html').getAttribute('data-theme-transitions')) ?? '')
      .split('|')
      .flatMap((className) => className.split(/\s+/u))
      .filter((className) => className === 'light' || className === 'dark');
    expect(firstPaintTheme).toBe(entry.theme);
    expect(themedFrames).not.toContain(entry.theme === 'dark' ? 'light' : 'dark');

    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    await expect(page.locator('a.skip-link')).toHaveCount(1);
    await expect(page.locator('a.skip-link')).toHaveText(expected.skip);
    await expectNoShellOverflow(page);
    await expectVisibleTargetsAtLeast44(
      page,
      'header a, header button, [role="dialog"] a, [role="dialog"] button',
    );

    const desktop = entry.viewport.width >= 1024;
    if (desktop) {
      await expect(
        page.getByRole('button', { name: expected.nextTheme[entry.theme] }).first(),
      ).toBeVisible();
      const navigation = page.getByRole('navigation', { name: expected.primaryNav });
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole('link')).toHaveText(expected.navigation);
      expect(
        await navigation
          .getByRole('link')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
      ).toEqual(navigationHrefs);
      await expect(navigation.locator('[aria-current="page"]')).toHaveText(expected.navigation[0]);
      await expect(
        navigation.getByRole('link', { name: expected.navigation[2] }),
      ).not.toHaveAttribute('aria-current');
      await page.keyboard.press('Tab');
      await expect(page.locator('a.skip-link')).toBeFocused();
      await expect(page.locator('a.skip-link')).toHaveCSS('outline-style', /^(?!none$).+/u);
      expect(await contrastRatio(page, '.nav__links [aria-current="page"]')).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(await contrastRatio(page, '.nav__cta .btn--accent')).toBeGreaterThanOrEqual(4.5);
      for (const scope of ['header.nav', 'footer.footer']) {
        const axe = await new AxeBuilder({ page })
          .include(scope)
          .setLegacyMode()
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(
          axe.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
          `axe shell scope: ${scope}`,
        ).toEqual([]);
      }
    } else {
      const trigger = page.locator('.nav__menu');
      await expect(trigger).toHaveAccessibleName(expected.open);
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: expected.menu });
      const navigation = dialog.getByRole('navigation', { name: expected.mobileNav });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: expected.nextTheme[entry.theme] }),
      ).toBeVisible();
      await expect(trigger).toHaveAttribute('aria-label', expected.close);
      await expect(navigation.getByRole('link')).toHaveText(expected.navigation);
      expect(
        await navigation
          .getByRole('link')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
      ).toEqual(navigationHrefs);
      await expect(navigation.locator('[aria-current="page"]')).toHaveText(expected.navigation[0]);
      await expect(
        navigation.getByRole('link', { name: expected.navigation[2] }),
      ).not.toHaveAttribute('aria-current');
      await expectNoShellOverflow(page, true);
      await expectVisibleTargetsAtLeast44(page, '[role="dialog"] a, [role="dialog"] button');
      expect(await contrastRatio(page, '.public-mobile-dialog__cta')).toBeGreaterThanOrEqual(4.5);
      const axe = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .setLegacyMode()
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        axe.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
      ).toEqual([]);
      await dialog.getByRole('button', { name: expected.language }).click();
      await expect(
        page.getByRole('menuitemradio', { name: entry.locale === 'en' ? 'English' : 'العربية' }),
      ).toHaveAttribute('aria-checked', 'true');
      await expect(
        page.getByRole('menuitemradio', { name: expected.otherLanguage }),
      ).toHaveAttribute('aria-checked', 'false');
      await page.keyboard.press('Escape');
      await dialog.getByRole('button', { name: expected.close }).click();
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }

    if (desktop) {
      await page.getByRole('button', { name: expected.language }).first().click();
      await expect(
        page.getByRole('menuitemradio', { name: entry.locale === 'en' ? 'English' : 'العربية' }),
      ).toHaveAttribute('aria-checked', 'true');
      await expect(
        page.getByRole('menuitemradio', { name: expected.otherLanguage }),
      ).toHaveAttribute('aria-checked', 'false');
      await page.keyboard.press('Escape');
    }
    await page.goto('/pricing', { waitUntil: 'networkidle' });
    await expectNoDocumentOverflow(page);
    expect(runtimeProblems).toEqual([]);
  });
}

test('exact current state is correct on every page-owning navigation route', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const { route, currentIndex } of currentRouteCases) {
    await page.goto(route, { waitUntil: 'networkidle' });
    const desktopNavigation = page.getByRole('navigation', { name: copy.en.primaryNav });
    await expect(desktopNavigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(desktopNavigation.locator('[aria-current="page"]')).toHaveText(
      copy.en.navigation[currentIndex],
    );
    await expect(
      desktopNavigation.getByRole('link', { name: copy.en.navigation[2] }),
    ).not.toHaveAttribute('aria-current');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: copy.en.open }).click();
    const mobileNavigation = page
      .getByRole('dialog', { name: copy.en.menu })
      .getByRole('navigation', { name: copy.en.mobileNav });
    await expect(mobileNavigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(mobileNavigation.locator('[aria-current="page"]')).toHaveText(
      copy.en.navigation[currentIndex],
    );
    await expect(
      mobileNavigation.getByRole('link', { name: copy.en.navigation[2] }),
    ).not.toHaveAttribute('aria-current');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 800 });
  }
});

test('keyboard lifecycle, reduced motion, route close, and navigation parity', async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await primeState(context, page, 'en', 'dark');
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const trigger = page.getByRole('button', { name: copy.en.open });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: copy.en.menu });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('animation-name', 'none');
  await expect(dialog).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect(page.locator('main')).toHaveCSS('pointer-events', 'none');
  const focusable = dialog.locator(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  await focusable.last().focus();
  await page.keyboard.press('Tab');
  await expect(focusable.first()).toBeFocused();
  await focusable.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(focusable.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('link', { name: 'Customers' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/#customers$/u);
  await trigger.click();
  await page.evaluate(() => window.history.pushState({}, '', '/pricing?acceptance=1'));
  await expect(dialog).toBeHidden();
});

test('equivalent 200% reflow preserves every shell control at 720x450 CSS pixels', async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 720, height: 450 });
  await primeState(context, page, 'en', 'light');
  await page.goto('/', { waitUntil: 'networkidle' });
  const trigger = page.getByRole('button', { name: copy.en.open });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: copy.en.menu });
  await expect(dialog).toBeVisible();
  await expectNoShellOverflow(page, true);
  const controls = [
    ...copy.en.navigation.map((name) => dialog.getByRole('link', { name, exact: true })),
    dialog.getByRole('button', { name: copy.en.language }),
    dialog.getByRole('button', { name: copy.en.nextTheme.light }),
    dialog.getByRole('link', { name: 'Sign in', exact: true }),
    dialog.getByRole('link', { name: 'Get Estimate', exact: true }),
  ];
  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    await expect(control).toBeVisible();
    await control.click({ trial: true });
  }
  await dialog.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const dialogScroll = await dialog.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(dialogScroll.scrollHeight).toBeGreaterThan(dialogScroll.clientHeight);
  expect(dialogScroll.scrollTop).toBeGreaterThan(0);
  expect(dialogScroll.scrollTop + dialogScroll.clientHeight).toBeGreaterThanOrEqual(
    dialogScroll.scrollHeight - 1,
  );
  for (const control of controls.slice(-2)) {
    await expect(control).toBeInViewport();
    await control.click({ trial: true });
  }
  const keyboardControls = dialog.locator(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  await keyboardControls.first().focus();
  for (let index = 1; index < (await keyboardControls.count()); index += 1) {
    await page.keyboard.press('Tab');
    await expect(keyboardControls.nth(index)).toBeFocused();
  }
  await expect(keyboardControls.last()).toBeInViewport();
  const evidenceDir = process.env.PUBLIC_SHELL_EVIDENCE_DIR;
  if (evidenceDir)
    await page.screenshot({
      path: path.join(evidenceDir, 'reflow-200-equivalent-en-light-720x450.png'),
    });
});

test('every unique shell destination returns a successful public or auth response', async ({
  request,
}) => {
  for (const destination of shellDestinations) {
    const response = await request.get(destination);
    expect(response.status(), destination).toBeLessThan(400);
  }
});

test('capture the five sanitized material states when evidence output is requested', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const evidenceDir = process.env.PUBLIC_SHELL_EVIDENCE_DIR;
  test.skip(!evidenceDir, 'Set PUBLIC_SHELL_EVIDENCE_DIR to retain sanitized screenshots.');
  const states = [
    {
      file: 'desktop-en-light-1440x900.png',
      locale: 'en',
      theme: 'light',
      route: '/',
      viewport: { width: 1440, height: 900 },
      menu: false,
    },
    {
      file: 'desktop-ar-dark-1440x900.png',
      locale: 'ar',
      theme: 'dark',
      route: '/',
      viewport: { width: 1440, height: 900 },
      menu: false,
    },
    {
      file: 'mobile-menu-en-dark-390x844.png',
      locale: 'en',
      theme: 'dark',
      route: '/pricing',
      viewport: { width: 390, height: 844 },
      menu: true,
    },
    {
      file: 'mobile-menu-ar-dark-390x844.png',
      locale: 'ar',
      theme: 'dark',
      route: '/pricing',
      viewport: { width: 390, height: 844 },
      menu: true,
    },
  ] as const;
  for (const state of states) {
    const context = await browser.newContext({
      viewport: state.viewport,
      colorScheme: state.theme,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await primeState(context, page, state.locale, state.theme);
    await page.goto(state.route, { waitUntil: 'networkidle' });
    await expect(page.getByRole('banner')).toBeVisible();
    if (state.menu) {
      await page.getByRole('button', { name: copy[state.locale].open }).click();
      const dialog = page.getByRole('dialog', { name: copy[state.locale].menu });
      await expect(dialog).toBeVisible();
      await expectNoShellOverflow(page, true);
      await page.screenshot({ path: path.join(evidenceDir!, state.file) });
    } else {
      await expect(page.locator('.hero h1')).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir!, state.file) });
    }
    await context.close();
  }
});
