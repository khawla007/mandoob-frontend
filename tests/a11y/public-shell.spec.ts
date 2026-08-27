import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const expectedNavigation: readonly {
  name: string;
  href: string;
  currentPath?: string;
}[] = [
  { name: 'Platform', href: '/#services', currentPath: '/' },
  { name: 'Estimate', href: '/estimate', currentPath: '/estimate' },
  { name: 'Customers', href: '/#customers' },
  { name: 'For PROs', href: '/pro', currentPath: '/pro' },
  { name: 'Pricing', href: '/pricing', currentPath: '/pricing' },
];

test('desktop and mobile use the same ordered destinations with exact current-page state', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 844 });

  for (const path of ['/', '/estimate', '/pro', '/pricing'] as const) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const desktopNav = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(desktopNav).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(1);
    await expect(desktopNav.getByRole('link')).toHaveText(
      expectedNavigation.map((item) => item.name),
    );
    await expect(desktopNav.locator('[aria-current="page"]')).toHaveText(
      expectedNavigation.find((item) => item.currentPath === path)!.name,
    );
    await expect(desktopNav.getByRole('link', { name: 'Customers' })).not.toHaveAttribute(
      'aria-current',
    );

    if (path === '/') {
      const targetSizes = await page
        .locator('.nav__brand, .nav__links a, .nav__cta a, .nav__cta button')
        .evaluateAll((targets) =>
          targets.map((target) => {
            const rect = target.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          }),
        );
      expect(targetSizes.length).toBeGreaterThan(0);
      expect(targetSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);

      const activeContrast = await page
        .locator('.nav__links [aria-current="page"]')
        .evaluate((activeLink) => {
          const toSrgb = (value: string) => {
            const colorCanvas = document.createElement('canvas');
            colorCanvas.width = 1;
            colorCanvas.height = 1;
            const context = colorCanvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Canvas color conversion is unavailable');
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
            if (alpha === 0) throw new Error(`Unsupported or transparent color: ${value}`);
            return {
              channels: [red, green, blue] as const,
              alpha: alpha / 255,
            };
          };
          const foreground = toSrgb(getComputedStyle(activeLink).color);
          const header = toSrgb(
            getComputedStyle(document.querySelector<HTMLElement>('.nav')!).backgroundColor,
          );
          const canvas = toSrgb(
            getComputedStyle(document.querySelector<HTMLElement>('.site-public')!).backgroundColor,
          );
          const [headerRed, headerGreen, headerBlue] = header.channels;
          const [canvasRed, canvasGreen, canvasBlue] = canvas.channels;
          const background = [
            headerRed * header.alpha + canvasRed * (1 - header.alpha),
            headerGreen * header.alpha + canvasGreen * (1 - header.alpha),
            headerBlue * header.alpha + canvasBlue * (1 - header.alpha),
          ] as const;
          const luminance = (channels: readonly [number, number, number]) => {
            const linear = channels.map((channel) => {
              const normalized = channel / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
          };
          const values = [luminance(foreground.channels), luminance(background)].sort(
            (first, second) => second - first,
          );
          return (values[0] + 0.05) / (values[1] + 0.05);
        });
      expect(activeContrast).toBeGreaterThanOrEqual(4.5);
    }
  }

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const desktopNav = page.getByRole('navigation', { name: 'Primary navigation' });
  const desktopDestinations = await desktopNav
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(desktopDestinations).toEqual(expectedNavigation.map((item) => item.href));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Navigation menu' });
  const mobileNav = dialog.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNav.getByRole('link')).toHaveText(expectedNavigation.map((item) => item.name));
  expect(
    await mobileNav
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
  ).toEqual(desktopDestinations);

  await mobileNav.getByRole('link', { name: 'Customers' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/#customers$/u);
});

test('mobile public shell is modal, keyboard-contained, localized, and overflow-safe', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.goto('/', { waitUntil: 'networkidle' });
  const trigger = page.locator('.nav__menu');
  await expect(trigger).toHaveAccessibleName('Open menu');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  const dialog = page.getByRole('dialog', { name: 'Navigation menu' });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        transform: style.transform,
      };
    }),
  ).toEqual({ left: 0, top: 0, width: 390, height: 844, transform: 'none' });
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await expect(page.locator('main')).toHaveCSS('pointer-events', 'none');
  await expect(dialog).toHaveCSS('pointer-events', 'auto');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

  const focusable = dialog.locator(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  const focusableCount = await focusable.count();
  expect(focusableCount).toBeGreaterThan(3);
  await focusable.last().focus();
  await page.keyboard.press('Tab');
  await expect(focusable.first()).toBeFocused();
  await focusable.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(focusable.last()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 844 });
  await expect(dialog).toBeHidden();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('main')).toHaveCSS('pointer-events', 'auto');
  await expect(trigger).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole('link', { name: 'Platform' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/#services$/u);

  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    window.history.pushState({}, '', '/pricing?mobile-dialog-pathname=1');
  });
  await expect(page).toHaveURL(/\/pricing\?mobile-dialog-pathname=1$/u);
  await expect(dialog).toBeHidden();
  await page.goto('/', { waitUntil: 'networkidle' });

  await trigger.click();
  const languageTrigger = dialog.getByRole('button', { name: /English.*Language/u });
  await expect(languageTrigger).toBeVisible();
  await languageTrigger.focus();
  await page.keyboard.press('Enter');
  const english = page.getByRole('menuitemradio', { name: 'English' });
  const arabic = page.getByRole('menuitemradio', { name: 'العربية' });
  await expect(english).toHaveAttribute('aria-checked', 'true');
  await expect(arabic).toHaveAttribute('aria-checked', 'false');
  await expect(english).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(arabic).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(dialog.getByRole('button', { name: /theme/u })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /sign in/i })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /get started|get estimate/i })).toBeVisible();

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: /English.*Language/u }).click();
  await page.getByRole('menuitemradio', { name: 'العربية' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  const arabicDialog = page.getByRole('dialog', { name: 'قائمة التنقل' });
  await expect(arabicDialog).toBeVisible();
  const overflow = await page.evaluate(() => {
    const openDialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      dialog: openDialog.scrollWidth - openDialog.clientWidth,
    };
  });
  expect(overflow).toEqual({ page: 0, dialog: 0 });
  expect(runtimeErrors).toEqual([]);
});
