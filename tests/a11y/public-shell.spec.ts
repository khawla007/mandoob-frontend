import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

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
  await dialog.getByRole('link', { name: 'Platform' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/#services$/u);

  await trigger.click();
  await expect(dialog.getByRole('button', { name: /English.*Language/u })).toBeVisible();
  await dialog.getByRole('button', { name: /English.*Language/u }).click();
  const english = page.getByRole('menuitemradio', { name: 'English' });
  const arabic = page.getByRole('menuitemradio', { name: 'العربية' });
  await expect(english).toHaveAttribute('aria-checked', 'true');
  await expect(arabic).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Home');
  await expect(english).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(arabic).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(dialog.getByRole('button', { name: /theme/u })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /sign in/i })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /get started|get estimate/i })).toBeVisible();

  await dialog.getByRole('link', { name: 'Pricing' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/pricing$/u);

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
