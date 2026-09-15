import { expect, type Page } from '@playwright/test';
import type { Result } from 'axe-core';

const APPROVED_PUBLIC_ACCENT_SELECTORS = [
  '.btn--accent',
  '.application-button:not(.application-button--secondary)',
  '.application-file-button',
  '.home-text-link',
  '.cell__link',
  ".nav__links a[aria-current='page']",
  '.public-mobile-dialog__cta',
] as const;

type ContrastData = {
  bgColor?: string;
  contrastRatio?: number;
  fgColor?: string;
};

function isApprovedPair(data: ContrastData): boolean {
  const orangeText =
    data.fgColor === '#ff5722' && ['#ffffff', '#fafafa'].includes(data.bgColor ?? '');
  const orangeSurface = data.fgColor === '#ffffff' && data.bgColor === '#ff5722';
  const expectedRatio = data.bgColor === '#fafafa' ? 3.03 : 3.16;
  return (
    (orangeText || orangeSurface) &&
    data.contrastRatio !== undefined &&
    Math.abs(data.contrastRatio - expectedRatio) <= 0.01
  );
}

export async function expectOnlyDocumentedPublicAccentContrast(
  page: Page,
  violations: Result[],
): Promise<void> {
  const unexpected: Array<{ id: string; html: string; target: unknown }> = [];

  for (const violation of violations) {
    for (const node of violation.nodes) {
      const target = node.target.at(-1);
      const contrast = node.any.find(({ id }) => id === 'color-contrast')?.data as
        | ContrastData
        | undefined;
      const selectorBound =
        violation.id === 'color-contrast' &&
        typeof target === 'string' &&
        (await page
          .locator(target)
          .first()
          .evaluate(
            (element, selectors) => selectors.some((selector) => element.matches(selector)),
            APPROVED_PUBLIC_ACCENT_SELECTORS,
          ));

      if (!selectorBound || !contrast || !isApprovedPair(contrast)) {
        unexpected.push({ id: violation.id, html: node.html, target: node.target });
      }
    }
  }

  expect(
    unexpected,
    'only the documented selector-bound public orange exception is allowed',
  ).toEqual([]);
}

export async function expectCanonicalPublicCtaException(
  page: Page,
  selector: string,
): Promise<void> {
  await expect(page.locator(selector).first()).toHaveCSS('background-color', 'rgb(255, 87, 34)');
  await expect(page.locator(selector).first()).toHaveCSS('color', 'rgb(255, 255, 255)');
}
