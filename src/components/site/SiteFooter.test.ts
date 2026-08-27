import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const footer = readFileSync(new URL('./SiteFooter.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../app/(public)/public-theme.css', import.meta.url), 'utf8');

const expectedLinks = [
  ['/estimate', 'estimator'],
  ['/apply', 'startApplication'],
  ['/pro', 'forPros'],
  ['/pricing', 'pricing'],
  ['/about', 'about'],
  ['/knowledge-base', 'knowledgeBase'],
  ['/contact', 'contact'],
  ['/#flow', 'howItWorks'],
  ['/legal/privacy', 'privacy'],
  ['/legal/terms', 'terms'],
  ['/legal/pdpl', 'pdpl'],
  ['/legal/trust', 'trustCenter'],
] as const;

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u'))?.[1];
  assert.ok(block, `missing ${selector} declarations`);
  return block;
}

describe('SiteFooter localization and integrity contract', () => {
  it('is an async server component backed by the footer and site catalogs', () => {
    assert.match(footer, /import \{ getTranslations \} from 'next-intl\/server';/u);
    assert.match(footer, /export async function SiteFooter\(\)/u);
    assert.match(footer, /getTranslations\('site\.footer'\)/u);
    assert.match(footer, /getTranslations\('site'\)/u);
    assert.match(footer, /aria-label=\{tSite\('brandHome'\)\}/u);
  });

  it('renders one implicit contentinfo landmark and localized navigation labels', () => {
    assert.equal(footer.match(/<footer\b/gu)?.length, 1);
    assert.doesNotMatch(footer, /<footer[^>]*\srole=["']contentinfo["']/u);
    for (const heading of ['product', 'company', 'legal']) {
      assert.match(footer, new RegExp(`heading: tFooter\\('${heading}'\\)`, 'u'));
    }
    assert.match(footer, /aria-label=\{column\.heading\}/u);
  });

  it('preserves every reviewed destination with a catalog-backed label', () => {
    for (const [href, key] of expectedLinks) {
      const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      assert.match(footer, new RegExp(`href: '${escapedHref}', label: tFooter\\('${key}'\\)`, 'u'));
    }
    assert.equal(footer.match(/href: '\/(?:[^']*)'/gu)?.length, expectedLinks.length);
  });

  it('uses reviewed neutral identity copy and no unsupported claims or visible English', () => {
    for (const key of ['description', 'location', 'identity']) {
      assert.match(footer, new RegExp(`tFooter\\('${key}'\\)`, 'u'));
    }
    assert.doesNotMatch(
      footer,
      /trade\s+licen[cs]e|licen[cs]e\s*#|ISO\s*27001|TLS\s*1\.3|SOC\s*2|certified|government\s+partner/iu,
    );
    assert.doesNotMatch(
      footer,
      />\s*(?:Product|Company|Legal|Estimator|Start Application|For PROs|Pricing|About|Knowledge Base|Contact|How it works|Privacy|Terms|PDPL Statement|Trust Center)\s*</u,
    );
  });

  it('uses semantic logo colors instead of literal black or white', () => {
    assert.match(footer, /fill="var\(--public-text-primary\)"/u);
    assert.match(footer, /stroke="var\(--public-canvas\)"/u);
    assert.doesNotMatch(footer, /#[0-9a-f]{3,8}\b/iu);
  });
});

describe('SiteFooter layout contract', () => {
  it('keeps an asymmetric brand-led grid that collapses responsively', () => {
    assert.match(
      css,
      /@media \(min-width: 768px\)[\s\S]*?\.site-public \.footer__grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*2fr\) repeat\(3,\s*minmax\(0,\s*1fr\)\)/u,
    );
    assert.match(declarations('.site-public .footer__grid'), /grid-template-columns:\s*1fr/u);
    assert.doesNotMatch(declarations('.site-public .footer__grid'), /direction\s*:/u);
  });

  it('provides 44px link targets, wrapping, and a visible semantic focus style', () => {
    const link = declarations('.site-public .footer__col a');
    assert.match(link, /min-height:\s*44px/u);
    assert.match(link, /overflow-wrap:\s*anywhere/u);
    assert.match(
      declarations('.site-public .footer__col a:focus-visible'),
      /var\(--public-focus-ring\)/u,
    );
  });

  it('adds no physical direction declarations or card treatment to footer rules', () => {
    const footerRules = [...css.matchAll(/([^{}]*\.footer(?:__[-\w]+)?[^{}]*)\{([^{}]*)\}/gu)];
    assert.ok(footerRules.length > 0);
    for (const [, selector, body] of footerRules) {
      assert.doesNotMatch(
        body,
        /(?:^|;)\s*(?:left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/u,
        `${selector.trim()} adds a physical direction declaration`,
      );
      assert.doesNotMatch(
        body,
        /border-radius\s*:|box-shadow\s*:/u,
        `${selector.trim()} is card-like`,
      );
    }
  });
});
