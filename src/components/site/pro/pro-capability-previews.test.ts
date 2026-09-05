import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import React from 'react';

import { PUBLIC_PRICING_CONTRACT } from '@/lib/pricing/public-pricing';
import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';

const pageSource = readFileSync(
  new URL('../../../app/(public)/pro/page.tsx', import.meta.url),
  'utf8',
);
const dashboardSource = readFileSync(
  new URL('../home/DashboardSection.tsx', import.meta.url),
  'utf8',
);
const previewSource = readFileSync(new URL('../DashboardPreview.tsx', import.meta.url), 'utf8');
const proDashboardSectionSource = readFileSync(
  new URL('./ProDashboardSection.tsx', import.meta.url),
  'utf8',
);
const proDashboardPreviewSource = readFileSync(
  new URL('./ProDashboardPreview.tsx', import.meta.url),
  'utf8',
);
const bentoSource = readFileSync(new URL('../home/BentoGridSection.tsx', import.meta.url), 'utf8');
const finalCtaSource = readFileSync(new URL('./ProFinalCtaSection.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(
  new URL('../../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);
const proCssStart = cssSource.indexOf('/* ---------- P1.06 PRO operating model ---------- */');
const proCssEnd = cssSource.indexOf('/* ---------- P1.05 CONTACT FORM ---------- */');
const proCss = cssSource.slice(proCssStart, proCssEnd);

const faqIds = [
  'eligibility',
  'assignment',
  'company-limit',
  'migration-import',
  'white-label',
  'channels-providers',
  'subscription-access',
  'support',
  'next-steps',
] as const;

const forbiddenPreviewCopy =
  /\bClients?\b|\bLeads?\b|team capacity|Company switcher|multi-company|Acme|Naseej|Quay|Atlas|Reem|Sarah|Ahmed|Jonas|\.mandoob\.app|\.(?:pdf|png|docx)\b|\bINV[-\s]?\d+\b|\bAED\s*\d|\b\d+%\b|\b\d{1,2}:\d{2}\b|\b\d+\s*days?\b|\bIP\b|\bRLS\b|immutable|encrypted|\blive\b/iu;

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderIt = reactServer ? ((() => undefined) as unknown as typeof it) : it;

const render = async (element: React.ReactNode) => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  return renderToStaticMarkup(element);
};

const renderProPage = async () => {
  const { default: ProPage } = await import('@/app/(public)/pro/page');
  return render(React.createElement(ProPage));
};

if (reactServer) {
  it('runs Slice 7 render contracts under the client React export condition', () => {
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

describe('frozen Slice 7 PRO content contract', () => {
  it('deeply freezes illustrative preview, safe benefits, package, FAQ, and CTA content', () => {
    const { preview, benefits, packages, faq, finalCta } = PUBLIC_PRO_CONTENT;

    assert.equal(Object.isFrozen(preview), true);
    assert.equal(Object.isFrozen(preview.dashboard.slots), true);
    assert.equal(Object.isFrozen(preview.bento.tiles[0]), true);
    assert.equal(Object.isFrozen(benefits.items), true);
    assert.equal(Object.isFrozen(packages.tiers), true);
    assert.equal(Object.isFrozen(faq.items[0].answer.fragments), true);
    assert.equal(Object.isFrozen(finalCta.links), true);
    assert.throws(() => {
      (preview.dashboard.slots as unknown as { label: string }[])[0].label = 'replacement';
    }, TypeError);
  });

  it('keeps illustrative slots and unavailable facts explicitly discriminated', () => {
    const { preview } = PUBLIC_PRO_CONTENT;

    assert.equal(preview.label.text, 'Illustrative product preview');
    assert.equal(preview.label.source.state, 'illustrative');
    assert.equal(preview.dashboard.interaction.source.state, 'unavailable');
    assert.ok(preview.dashboard.slots.some((slot) => slot.value.source.state === 'unavailable'));
    assert.equal(preview.bento.tiles.length, 6);
    assert.ok(
      preview.bento.tiles.every(
        (tile) =>
          tile.preview.source.state === 'illustrative' ||
          tile.preview.source.state === 'unavailable',
      ),
    );
  });

  it('derives the exact three one-Company package connections from pricing truth', () => {
    assert.deepEqual(
      PUBLIC_PRO_CONTENT.packages.tiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        activeCompanyLimit: tier.activeCompanyLimit,
        allocation: tier.allocation.source.state,
      })),
      PUBLIC_PRICING_CONTRACT.tiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        activeCompanyLimit: tier.activeCompanyLimit,
        allocation: 'unavailable',
      })),
    );
    assert.deepEqual(
      PUBLIC_PRO_CONTENT.packages.tiers.map((tier) => tier.name),
      ['Starter', 'Professional', 'Enterprise'],
    );
    assert.equal(PUBLIC_PRO_CONTENT.packages.link.href, '/pricing');
  });

  it('models capabilities without outcomes and all nine FAQ topics as sourced fragments', () => {
    assert.deepEqual(
      PUBLIC_PRO_CONTENT.benefits.items.map((item) => item.title.text),
      ['Centralized records', 'Visible deadlines', 'Controlled access', 'Workflow context'],
    );
    assert.deepEqual(
      PUBLIC_PRO_CONTENT.faq.items.map((item) => item.id),
      faqIds,
    );
    assert.ok(
      PUBLIC_PRO_CONTENT.faq.items.every((item) =>
        item.answer.fragments.every((fragment) =>
          ['approved-static', 'unavailable'].includes(fragment.source.state),
        ),
      ),
    );
    assert.doesNotMatch(
      JSON.stringify({ benefits: PUBLIC_PRO_CONTENT.benefits, faq: PUBLIC_PRO_CONTENT.faq }),
      /guarantee|always|never|SLA|response time|provider is live|fully compliant|zero fines/iu,
    );
  });
});

describe('PRO-specific dashboard and bento previews', () => {
  renderIt(
    'renders a meaningful, explicitly illustrative, noninteractive dashboard figure',
    async () => {
      const { ProDashboardPreview } = await import('./ProDashboardPreview');
      const html = await render(React.createElement(ProDashboardPreview));

      assert.match(html, /<figure[^>]*data-preview-interaction="none"/u);
      assert.match(html, /aria-labelledby="pro-preview-label"/u);
      assert.match(html, /aria-describedby="pro-preview-description"/u);
      assert.match(html, />Illustrative product preview</u);
      assert.match(html, /noninteractive/iu);
      assert.match(html, /at most one active assigned Company/iu);
      assert.match(html, /data-source-state="unavailable"/u);
      assert.doesNotMatch(html, /<button\b|<a\b|role="tab|aria-live=/u);
      assert.doesNotMatch(html, forbiddenPreviewCopy);
    },
  );

  renderIt(
    'preserves the exact legacy homepage dashboard fixture and parent composition',
    async () => {
      const { DashboardPreview } = await import('@/components/site/DashboardPreview');
      const html = await render(DashboardPreview());

      assert.match(html, /role="tablist"/u);
      assert.match(html, /Asia\/Dubai · live/u);
      assert.match(html, /COMPANY<\/p><p class="fkpiV mono">ACTIVE/u);
      assert.match(html, /Visa stamped · Reem A\.<\/span><span class="mono ffeed__meta">12:42/u);
      assert.match(
        dashboardSource,
        /import \{ DashboardPreview \} from '@\/components\/site\/DashboardPreview';/u,
      );
      assert.match(
        dashboardSource,
        /<section id="dashboard" className="showcase" aria-labelledby="show-h">/u,
      );
      assert.match(dashboardSource, /<DashboardPreview \/>/u);
      assert.match(dashboardSource, /<h3 id="ff-alerts">Live renewal alerts<\/h3>/u);
      assert.match(dashboardSource, /<h3 id="ff-audit">Audit-ready<\/h3>/u);
      assert.match(dashboardSource, /<h3 id="ff-whitelabel">White-label<\/h3>/u);
      assert.doesNotMatch(dashboardSource, /PUBLIC_PRO_CONTENT|variant=['"]pro['"]/u);
    },
  );

  renderIt('renders the preview description and each workspace area state only once', async () => {
    const { ProDashboardSection } = await import('./ProDashboardSection');
    const html = await render(React.createElement(ProDashboardSection));

    assert.equal((html.match(/A noninteractive workspace illustration/gu) ?? []).length, 1);
    for (const area of PUBLIC_PRO_CONTENT.preview.dashboard.areas) {
      assert.equal((html.match(new RegExp(area.label.text, 'gu')) ?? []).length, 1);
    }
    assert.equal((html.match(/Illustrative workspace area/gu) ?? []).length, 2);
    assert.equal((html.match(/Provider and transaction data unavailable/gu) ?? []).length, 1);
  });

  renderIt(
    'renders a six-tile one-Company bento with readiness replacing the lead board',
    async () => {
      const { BentoGridSection } = await import('@/components/site/home/BentoGridSection');
      const html = await render(BentoGridSection({ variant: 'pro' }));

      assert.match(html, /aria-label="Illustrative one-Company capability preview"/u);
      assert.equal((html.match(/data-pro-bento-tile=/gu) ?? []).length, 6);
      assert.match(html, /Legal Company readiness/iu);
      assert.match(html, /Illustrative product preview/iu);
      assert.match(html, /data-source-state="unavailable"/u);
      assert.doesNotMatch(html, /lead board|Kanban|drag|CRM/iu);
      assert.doesNotMatch(html, forbiddenPreviewCopy);
    },
  );

  renderIt('keeps the default bento identical to its explicit homepage variant', async () => {
    const { BentoGridSection } = await import('@/components/site/home/BentoGridSection');
    const defaultHtml = await render(BentoGridSection());
    const homeHtml = await render(BentoGridSection({ variant: 'home' }));

    assert.equal(defaultHtml, homeHtml);
    assert.match(defaultHtml, /Lead board/u);
    assert.equal((defaultHtml.match(/class="bento-tile /gu) ?? []).length, 6);
  });
});

describe('PRO benefits, package connection, FAQ, and final CTA rendering', () => {
  renderIt(
    'renders safe capabilities, exact package truth, and native sourced FAQ disclosures',
    async () => {
      const { ProBenefitsFaqSection } = await import('./ProBenefitsFaqSection');
      const html = await render(React.createElement(ProBenefitsFaqSection));

      assert.equal((html.match(/data-pro-benefit=/gu) ?? []).length, 4);
      assert.equal((html.match(/data-pro-package=/gu) ?? []).length, 3);
      assert.equal((html.match(/at most one active Company/giu) ?? []).length, 3);
      assert.equal((html.match(/data-pro-faq=/gu) ?? []).length, faqIds.length);
      assert.equal((html.match(/<summary>/gu) ?? []).length, faqIds.length);
      assert.match(html, /data-source-state="approved-static"/u);
      assert.match(html, /data-source-state="unavailable"/u);
      assert.match(html, /href="\/pricing"[^>]*>Compare plans</u);
      assert.doesNotMatch(html, /role="button"|aria-expanded|onClick/iu);
      assert.doesNotMatch(html, /guarantee|SLA|response time|provider is live|fully compliant/iu);
    },
  );

  renderIt(
    'renders the exact two final actions in the accepted conversion-band grammar',
    async () => {
      const { ProFinalCtaSection } = await import('./ProFinalCtaSection');
      const html = await render(React.createElement(ProFinalCtaSection));
      const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gu)].map(
        (match) => ({ href: match[1], label: match[2] }),
      );

      assert.match(html, /class="about-contact-conversion"/u);
      assert.deepEqual(links, [
        { href: '/pricing', label: 'Explore plans' },
        { href: '/contact', label: 'Discuss access' },
      ]);
      assert.doesNotMatch(html, /Three tiers|AED-billed|No setup fee|href="\/register\/pro/iu);
    },
  );
});

describe('Slice 7 composition and source boundaries', () => {
  renderIt(
    'mounts sections five through seven in order and keeps the final page output safe',
    async () => {
      const html = await renderProPage();
      const preview = html.indexOf('id="dashboard"');
      const bento = html.indexOf('id="bento"');
      const benefits = html.indexOf('id="pro-benefits-packages"');
      const faq = html.indexOf('id="pro-faq"');
      const cta = html.indexOf('aria-labelledby="pro-final-cta-title"');

      assert.ok(preview >= 0 && preview < bento && bento < benefits && benefits < faq && faq < cta);
      assert.doesNotMatch(html.slice(preview), forbiddenPreviewCopy);
      assert.doesNotMatch(html.slice(preview), /href="\/register\/pro/iu);
    },
  );

  it('uses closed PRO variants and centralized content without altering default branches', () => {
    assert.match(
      pageSource,
      /import \{ ProDashboardSection \} from '@\/components\/site\/pro\/ProDashboardSection';/u,
    );
    assert.match(pageSource, /<ProDashboardSection \/>/u);
    assert.match(pageSource, /<BentoGridSection variant="pro" \/>/u);
    assert.match(pageSource, /<ProBenefitsFaqSection \/>/u);
    assert.doesNotMatch(pageSource, /DashboardPreview|home\/DashboardSection/u);
    assert.match(
      proDashboardSectionSource,
      /import \{ ProDashboardPreview \} from '.\/ProDashboardPreview';/u,
    );
    assert.match(proDashboardSectionSource, /<ProDashboardPreview \/>/u);
    assert.doesNotMatch(
      proDashboardSectionSource,
      /@\/components\/site\/DashboardPreview|<DashboardPreview\b|home\/DashboardSection/u,
    );
    assert.doesNotMatch(
      `${proDashboardSectionSource}\n${proDashboardPreviewSource}`,
      /['"]use client['"]|\buse[A-Z]\w*\s*\(|\b(?:NAV|PANELS)\b/u,
    );
    assert.doesNotMatch(proDashboardPreviewSource, forbiddenPreviewCopy);
    assert.doesNotMatch(previewSource, /PUBLIC_PRO_CONTENT|variant/u);
    assert.match(bentoSource, /variant = 'home'/u);
    assert.match(bentoSource, /satisfies Record<PublicProPreviewTileId, ProBentoPresentation>/u);
    assert.match(bentoSource, /proBentoPresentation\[tile\.id\]/u);
    assert.doesNotMatch(bentoSource, /proBento(?:Classes|Icons)\[index\]/u);
    assert.match(finalCtaSource, /finalCta \} = PUBLIC_PRO_CONTENT/u);
  });

  it('scopes inert, logical, light-dark, and smaller-screen Slice 7 styles', () => {
    assert.ok(proCssStart >= 0);
    assert.match(proCss, /\.site-public \.showcase--pro/u);
    assert.match(proCss, /\.site-public \.frame--pro/u);
    assert.match(proCss, /pointer-events:\s*none/u);
    assert.match(proCss, /\.site-public \.bento-grid--pro/u);
    assert.match(proCss, /\.site-public \.pro-benefits/u);
    assert.match(proCss, /\.site-public \.pro-faq/u);
    assert.match(proCss, /\.dark \.site-public \.pro-/u);
    assert.match(proCss, /@media \(max-width: 899px\)/u);
    assert.match(proCss, /(?:margin|padding|inset|border)-(?:inline|block)/u);
    assert.doesNotMatch(proCss, /\b(?:margin|padding)-(?:left|right):|\b(?:left|right):/u);
  });
});
