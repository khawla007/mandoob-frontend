import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import React from 'react';

import { PUBLIC_PRICING_CONTRACT } from '@/lib/pricing/public-pricing';

const pageSource = readFileSync(
  new URL('../../../app/(public)/pricing/page.tsx', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);
const pricingCssStart = cssSource.indexOf(
  '/* ---------- P1.06 Pricing hero and tier cards ---------- */',
);
const pricingCssEnd = cssSource.indexOf('/* ---------- P1.05 CONTACT FORM ---------- */');
const pricingCss = cssSource.slice(pricingCssStart, pricingCssEnd);

const forbiddenPricingCopy =
  /popular|recommended|discount|saving|setup fee|free trial|checkout|\bUSD\b|\$\s*\d|\bAED\s*\d|\b\d+[,.]?\d*\s*(?:AED|USD|\/\s*month|\/\s*year)/iu;

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderIt = reactServer ? ((() => undefined) as unknown as typeof it) : it;

const renderPricingPage = async () => {
  const [{ renderToStaticMarkup }, { default: PricingPage }] = await Promise.all([
    import('react-dom/server'),
    import('@/app/(public)/pricing/page'),
  ]);
  return renderToStaticMarkup(React.createElement(PricingPage));
};

if (reactServer) {
  it('runs pricing hero and tier render contracts under the client React export condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

describe('pricing hero and tier cards', () => {
  renderIt(
    'renders one breadcrumb hero with the exact truthful actions and billing context',
    async () => {
      const html = await renderPricingPage();

      assert.equal(html.match(/<h1\b/gu)?.length, 1);
      assert.match(html, /<nav[^>]*aria-label="Breadcrumb"/u);
      assert.match(html, /<li aria-current="page">Pricing<\/li>/u);
      assert.match(html, /workspace/iu);
      assert.match(html, /At most one active Company per PRO/u);
      assert.match(html, /monthly and annual/iu);
      assert.match(html, /subject to confirmation/iu);
      assert.match(html, /<a[^>]*href="\/contact"[^>]*>Discuss plans<\/a>/u);
      assert.match(html, /<a[^>]*href="\/pro"[^>]*>Explore PRO fit<\/a>/u);
    },
  );

  renderIt(
    'renders exactly three ordered contract-driven cards with complete safe facts',
    async () => {
      const html = await renderPricingPage();

      assert.equal(html.match(/<article\b[^>]*data-pricing-tier=/gu)?.length, 3);
      let previousTier = -1;
      for (const tier of PUBLIC_PRICING_CONTRACT.tiers) {
        const tierStart = html.indexOf(`data-pricing-tier="${tier.id}"`);
        assert.ok(tierStart > previousTier, `${tier.name} must follow the preceding tier`);
        previousTier = tierStart;

        const intendedFit = tier.intendedFit;
        const caveat = tier.caveat;
        assert.ok(intendedFit, `${tier.name} must define intended-fit language centrally`);
        assert.ok(caveat, `${tier.name} must define its caveat centrally`);
        assert.match(html, new RegExp(intendedFit.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
        assert.match(html, new RegExp(caveat.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
        assert.match(html, new RegExp(`Request ${tier.name} plan information`, 'u'));
        const tierEnd = html.indexOf('</article>', tierStart);
        const tierMarkup = html.slice(tierStart, tierEnd);
        for (const category of tier.categories) {
          assert.match(
            tierMarkup,
            new RegExp(`>${category.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}<`, 'u'),
            `${tier.name} must render the ${category} category`,
          );
        }
      }

      assert.equal((html.match(/Price on request/gu) ?? []).length, 3);
      assert.equal((html.match(/At most one active Company per PRO/gu) ?? []).length, 5);
      assert.equal(
        (html.match(/Monthly concept<\/span>Subject to confirmation/gu) ?? []).length,
        3,
      );
      assert.equal((html.match(/Annual concept<\/span>Subject to confirmation/gu) ?? []).length, 3);
      assert.equal((html.match(/Government and third-party costs are separate/gu) ?? []).length, 3);
      assert.equal((html.match(/href="\/contact"/gu) ?? []).length, 4);
      assert.doesNotMatch(html, forbiddenPricingCopy);
    },
  );

  it('uses the centralized contract without a page-local plan fixture', () => {
    assert.match(pageSource, /PUBLIC_PRICING_CONTRACT\.tiers\.map/u);
    assert.match(pageSource, /formatPublicPrice\((?:plan|tier)\.price\)/u);
    assert.doesNotMatch(pageSource, /\b(?:const|let|var)\s+(?:plans|tiers|packages)\s*=/u);
    assert.doesNotMatch(pageSource, forbiddenPricingCopy);
  });

  it('renders publication-summary facts from the centralized contract without weaker literals', () => {
    for (const field of [
      'companyPolicy',
      'billingConcepts',
      'currentAvailability',
      'confirmationNotice',
      'categoryAllocationNotice',
      'separateCostsNotice',
    ]) {
      assert.match(pageSource, new RegExp(`publicationSummary\\.${field}\\.text`, 'u'), field);
    }

    assert.doesNotMatch(pageSource, /One active assignment/u);
    assert.doesNotMatch(pageSource, /Every tier supports at most one active Company per PRO/u);
    assert.doesNotMatch(pageSource, />Monthly and annual</u);
    assert.doesNotMatch(pageSource, />Subject to confirmation</u);
    assert.doesNotMatch(pageSource, /Exact amounts, billing terms, category allocation/iu);
    assert.doesNotMatch(pageSource, /The categories below describe supported areas only/iu);
    assert.doesNotMatch(pageSource, /Government and third-party costs are separate/iu);
  });

  it('uses only public-theme custom properties that are declared in the token source', () => {
    assert.ok(pricingCssStart >= 0, 'pricing CSS marker must exist');
    assert.ok(pricingCssEnd > pricingCssStart, 'pricing CSS block must end before the next marker');

    const declaredTokens = new Set(
      [...cssSource.matchAll(/(--[a-z0-9-]+)\s*:/giu)].map((match) => match[1]),
    );
    const usedTokens = new Set(
      [...pricingCss.matchAll(/var\((--[a-z0-9-]+)/giu)].map((match) => match[1]),
    );
    const undefinedTokens = [...usedTokens].filter((token) => !declaredTokens.has(token)).sort();

    assert.deepEqual(
      undefinedTokens,
      [],
      `Undefined pricing CSS tokens: ${undefinedTokens.join(', ')}`,
    );
  });

  it('locks source-level scoping, theme, and overflow-trigger safeguards', () => {
    assert.ok(pricingCss.length > 100);
    assert.match(pricingCss, /\.site-public \.pricing-hero/u);
    assert.match(pricingCss, /\.site-public \.pricing-hero__grid\s*\{[^}]*minmax\(0,/u);
    assert.match(pricingCss, /\.site-public \.pricing-tier-grid\s*\{[^}]*repeat\(3,\s*minmax\(0,/u);
    assert.match(pricingCss, /\.dark \.site-public \.pricing-/u);
    assert.match(
      pricingCss,
      /\.dark \.site-public \.pricing-hero__context,[\s\S]*?\.dark \.site-public \.pricing-tier-grid\s*\{[^}]*border-color:\s*var\(--public-border-strong\)/u,
    );
    assert.match(pricingCss, /@media \(max-width: 899px\)[\s\S]*grid-template-columns:\s*1fr/u);
    assert.match(pricingCss, /(?:margin|padding|inset|border)-(?:inline|block)/u);
    assert.doesNotMatch(
      pricingCss,
      /^(?!\s*(?:\.site-public|\.dark \.site-public|@|\/\*|\*|\}|$)).*\.pricing-/gmu,
    );
    assert.doesNotMatch(pricingCss, /\b(?:margin|padding)-(?:left|right):|\b(?:left|right):/u);
    assert.doesNotMatch(pricingCss, /(?:inline-size|width):\s*100vw/u);
  });

  it('uses the strong public border for every dark elevated-surface divider', () => {
    const strongDarkSelectors = new Set(
      [...pricingCss.matchAll(/([^{}]+)\{([^{}]*)\}/gu)]
        .filter((match) => /border-color:\s*var\(--public-border-strong\)/u.test(match[2]))
        .flatMap((match) => match[1].split(',').map((selector) => selector.trim())),
    );

    for (const selector of [
      '.dark .site-public .pricing-hero__context dl',
      '.dark .site-public .pricing-hero__context dl > div',
      '.dark .site-public .pricing-tier-card + .pricing-tier-card',
      '.dark .site-public .pricing-tier-card__price',
      '.dark .site-public .pricing-tier-card__cadence',
      '.dark .site-public .pricing-tier-card__boundaries',
    ]) {
      assert.ok(strongDarkSelectors.has(selector), `${selector} must use the strong dark border`);
    }
  });
});
