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

const processIds = [
  'review-fit',
  'discuss-verify',
  'verify-access',
  'assign-company',
  'configure-workspace',
  'operate-billing',
] as const;

const faqIds = [
  'subscription-includes',
  'pricing-confirmation',
  'company-limit',
  'billing-cadence',
  'external-fees',
  'allowances-add-ons',
  'plan-changes',
  'estimate-versus-quote',
  'billing-provider',
] as const;

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
  it('runs pricing process, FAQ, and CTA render contracts under the client React export condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

describe('pricing process, FAQ, and final CTA contract', () => {
  it('centralizes a deeply frozen ordered access process and explicit unavailable actions', () => {
    const { accessProcess } = PUBLIC_PRICING_CONTRACT;

    assert.deepEqual(
      accessProcess.steps.map((step) => step.id),
      processIds,
    );
    assert.ok(accessProcess.steps.every((step) => step.source.state === 'approved-static'));
    assert.equal(accessProcess.registration.source.state, 'unavailable');
    assert.match(accessProcess.registration.text, /PRO registration.*unavailable.*P1\.10/iu);
    assert.equal(accessProcess.checkout.source.state, 'unavailable');
    assert.match(accessProcess.checkout.text, /checkout.*provider.*unavailable.*Phase 3/iu);
    assert.equal('href' in accessProcess.registration, false);
    assert.equal('href' in accessProcess.checkout, false);
    assert.equal(Object.isFrozen(accessProcess), true);
    assert.equal(Object.isFrozen(accessProcess.steps), true);
    assert.equal(Object.isFrozen(accessProcess.steps[0]), true);
    assert.throws(() => {
      (accessProcess.steps as unknown as { id: string }[])[0].id = 'replacement';
    }, TypeError);
  });

  it('centralizes all required FAQ answers with reviewed source states and cautious copy', () => {
    const { faq } = PUBLIC_PRICING_CONTRACT;

    assert.deepEqual(
      faq.map((item) => item.id),
      faqIds,
    );
    assert.ok(
      faq.every(
        (item) =>
          item.question.length > 8 &&
          item.answer.text.length > 35 &&
          ['approved-static', 'unavailable'].includes(item.answer.source.state),
      ),
    );
    assert.equal(Object.isFrozen(faq), true);
    assert.equal(Object.isFrozen(faq[0].answer), true);

    const answers = Object.fromEntries(faq.map((item) => [item.id, item.answer.text]));
    assert.match(answers['subscription-includes'], /workspace.*one active assigned Company/iu);
    assert.match(answers['pricing-confirmation'], /exact amounts.*confirm/iu);
    assert.match(answers['company-limit'], /every tier.*at most one active.*Company/iu);
    assert.match(answers['billing-cadence'], /monthly and annual.*confirm/iu);
    assert.match(answers['billing-cadence'], /no pricing advantage.*published/iu);
    assert.match(answers['external-fees'], /government.*third-party.*separate.*vary/iu);
    assert.match(answers['allowances-add-ons'], /allowance.*usage-based.*confirm/iu);
    assert.match(answers['plan-changes'], /upgrades.*downgrades.*cancellation.*confirm/iu);
    assert.match(answers['estimate-versus-quote'], /indicative.*not.*quote/iu);
    assert.match(answers['billing-provider'], /billing provider.*checkout.*unavailable.*Phase 3/iu);
    assert.doesNotMatch(
      JSON.stringify(faq),
      /guarantee|service.level|response time|provider is live|fully compliant|instant purchase/iu,
    );
  });

  it('freezes the exact final CTA link order, labels, and destinations', () => {
    const { finalCta } = PUBLIC_PRICING_CONTRACT;

    assert.deepEqual(finalCta.links, [
      { label: 'Discuss plans', href: '/contact', source: finalCta.links[0].source },
      { label: 'Explore PRO workspace', href: '/pro', source: finalCta.links[1].source },
    ]);
    assert.ok(finalCta.links.every((link) => link.source.state === 'approved-static'));
    assert.equal(Object.isFrozen(finalCta), true);
    assert.equal(Object.isFrozen(finalCta.links), true);
    assert.doesNotMatch(
      JSON.stringify(finalCta),
      /AED-billed|no setup fee|start free|instant checkout/iu,
    );
  });
});

describe('pricing process, FAQ, and final CTA rendering', () => {
  renderIt(
    'renders six numbered access steps in contract order with one truthful discussion link',
    async () => {
      const html = await renderPricingPage();
      const sectionStart = html.indexOf('aria-labelledby="pricing-access-title"');
      const sectionEnd = html.indexOf('</section>', sectionStart);
      const section = html.slice(sectionStart, sectionEnd);

      assert.ok(sectionStart >= 0);
      assert.match(section, /<ol[^>]*class="pricing-process"/u);
      assert.equal((section.match(/<li[^>]*data-pricing-process-step=/gu) ?? []).length, 6);
      let previousStep = -1;
      for (const step of PUBLIC_PRICING_CONTRACT.accessProcess.steps) {
        const position = section.indexOf(`data-pricing-process-step="${step.id}"`);
        assert.ok(position > previousStep, `${step.id} must follow the preceding access step`);
        previousStep = position;
        assert.match(section, new RegExp(`>${step.title}<`, 'u'));
        assert.match(
          section,
          new RegExp(step.description.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
        );
      }
      assert.equal((section.match(/href="\/contact"/gu) ?? []).length, 1);
      assert.match(section, />Discuss plans</u);
    },
  );

  renderIt(
    'shows registration and checkout as plain unavailable text without fake actions',
    async () => {
      const html = await renderPricingPage();
      const sectionStart = html.indexOf('aria-labelledby="pricing-access-title"');
      const sectionEnd = html.indexOf('</section>', sectionStart);
      const section = html.slice(sectionStart, sectionEnd);

      assert.match(section, /PRO registration is unavailable[^<]*P1\.10/iu);
      assert.match(section, /checkout and billing provider access are unavailable[^<]*Phase 3/iu);
      assert.doesNotMatch(section, /href="\/register\/pro(?:"|[/?#])/u);
      assert.doesNotMatch(section, /href="[^"]*(?:checkout|stripe|payment)[^"]*"/iu);
      assert.doesNotMatch(section, />[^<]*(?:Register|Sign up|Checkout|Buy now)[^<]*<\/a>/iu);
      assert.doesNotMatch(section, /redirect[^<]*registration/iu);
    },
  );

  renderIt(
    'renders all FAQ topics with native two-column details and summary elements',
    async () => {
      const html = await renderPricingPage();
      const sectionStart = html.indexOf('aria-labelledby="pricing-faq-title"');
      const sectionEnd = html.indexOf('</section>', sectionStart);
      const section = html.slice(sectionStart, sectionEnd);

      assert.ok(sectionStart >= 0);
      assert.match(section, /class="pricing-faq__grid"/u);
      assert.equal((section.match(/<details[^>]*data-pricing-faq=/gu) ?? []).length, faqIds.length);
      assert.equal((section.match(/<summary>/gu) ?? []).length, faqIds.length);
      for (const item of PUBLIC_PRICING_CONTRACT.faq) {
        assert.match(section, new RegExp(`data-pricing-faq="${item.id}"`, 'u'));
        assert.match(
          section,
          new RegExp(`>${item.question.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}<`, 'u'),
        );
        assert.match(
          section,
          new RegExp(item.answer.text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
        );
      }
      assert.doesNotMatch(section, /role="button"|aria-expanded|onClick/iu);
    },
  );

  renderIt('renders the exact final conversion-band actions once and in order', async () => {
    const html = await renderPricingPage();
    const sectionStart = html.indexOf('aria-labelledby="pricing-final-cta-title"');
    const sectionEnd = html.indexOf('</section>', sectionStart);
    const section = html.slice(sectionStart, sectionEnd);

    const links = [...section.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gu)].map(
      (match) => ({ href: match[1], label: match[2] }),
    );
    assert.deepEqual(links, [
      { href: '/contact', label: 'Discuss plans' },
      { href: '/pro', label: 'Explore PRO workspace' },
    ]);
    assert.doesNotMatch(section, /AED-billed|no setup fee|start free|instant checkout/iu);
  });

  it('renders every section from the centralized contract without scattered commercial arrays', () => {
    assert.match(pageSource, /PUBLIC_PRICING_CONTRACT\.accessProcess\.steps\.map/u);
    assert.match(pageSource, /PUBLIC_PRICING_CONTRACT\.faq\.map/u);
    assert.match(pageSource, /PUBLIC_PRICING_CONTRACT\.finalCta\.links\.map/u);
    assert.doesNotMatch(
      pageSource,
      /\b(?:const|let|var)\s+(?:processSteps|steps|faqs|faqItems|finalCtas|ctaLinks)\s*=/u,
    );
    assert.doesNotMatch(pageSource, /href=["'{`]\/register\/pro/iu);
    assert.doesNotMatch(pageSource, /href=["'{`][^\n]*(?:checkout|stripe)/iu);
  });

  it('scopes light/dark, native FAQ, and responsive patterns with logical properties', () => {
    assert.match(pricingCss, /\.site-public \.pricing-access/u);
    assert.match(pricingCss, /\.site-public \.pricing-process/u);
    assert.match(pricingCss, /\.site-public \.pricing-faq__grid/u);
    assert.match(
      pricingCss,
      /\.site-public \.pricing-faq__grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u,
    );
    assert.match(pricingCss, /\.site-public \.pricing-faq__item summary:focus-visible/u);
    assert.match(pricingCss, /\.site-public \.pricing-final-cta/u);
    assert.match(pricingCss, /\.dark \.site-public \.pricing-(?:access|faq|final-cta)/u);
    assert.match(pricingCss, /@media \(max-width: 899px\)[\s\S]*\.pricing-faq__grid/u);
    assert.match(pricingCss, /(?:margin|padding|inset|border)-(?:inline|block)/u);
    assert.doesNotMatch(pricingCss, /\b(?:margin|padding)-(?:left|right):|\b(?:left|right):/u);
    assert.doesNotMatch(pricingCss, /(?:inline-size|width):\s*100vw/u);
  });
});
