import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import React from 'react';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';
import type { ApprovedPublicProFact, UnavailablePublicProFact } from '@/lib/pro/public-pro';

const pageSource = readFileSync(
  new URL('../../../app/(public)/pro/page.tsx', import.meta.url),
  'utf8',
);
const heroSource = readFileSync(new URL('./ProHeroSection.tsx', import.meta.url), 'utf8');
const audienceSource = readFileSync(
  new URL('./ProAudienceFitSection.tsx', import.meta.url),
  'utf8',
);
const processSource = readFileSync(
  new URL('./ProOperatingProcessSection.tsx', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);
const proCssStart = cssSource.indexOf('/* ---------- P1.06 PRO operating model ---------- */');
const proCssEnd = cssSource.indexOf('/* ---------- P1.05 CONTACT FORM ---------- */');
const proCss = cssSource.slice(proCssStart, proCssEnd);

const processIds = [
  'request-verify',
  'company-assignment',
  'company-setup',
  'operate-workspace',
  'configured-communication',
  'authorization-audit',
] as const;

const capabilityIds = [
  'company-foundations',
  'workforce-portals',
  'records-audit',
  'renewals',
  'invoices-payments',
] as const;

const capabilityConcepts = [
  /Legal Company profile/iu,
  /employee records.*visa and Emirates ID/iu,
  /Company documents[\s\S]*Storage allocation/iu,
  /Renewal records/iu,
  /invoice and payment workflow/iu,
  /Branding and contact configuration/iu,
  /attributed activity/iu,
  /customer and employee portal/iu,
] as const;

type AssertTrue<Value extends true> = Value;
type AffirmativePublicProFact =
  | (typeof PUBLIC_PRO_CONTENT.hero)['breadcrumb' | 'eyebrow' | 'title' | 'accent' | 'description']
  | (typeof PUBLIC_PRO_CONTENT.hero.links)[number]['label']
  | (typeof PUBLIC_PRO_CONTENT.policy)['label']
  | (typeof PUBLIC_PRO_CONTENT.policy.items)[number]['term' | 'detail']
  | (typeof PUBLIC_PRO_CONTENT.audience)['eyebrow' | 'title' | 'description']
  | (typeof PUBLIC_PRO_CONTENT.audience.items)[number]['title' | 'description']
  | (typeof PUBLIC_PRO_CONTENT.capabilities)['eyebrow' | 'title' | 'description']
  | (typeof PUBLIC_PRO_CONTENT.capabilities.items)[number]['title' | 'summary']
  | (typeof PUBLIC_PRO_CONTENT.capabilities.items)[number]['facts'][number]
  | (typeof PUBLIC_PRO_CONTENT.process)['eyebrow' | 'title' | 'description']
  | (typeof PUBLIC_PRO_CONTENT.process.steps)[number]['title' | 'description'];
type AffirmativeFieldsUseApprovedFact = AssertTrue<
  AffirmativePublicProFact extends ApprovedPublicProFact ? true : false
>;
type UnavailableCannotPopulateAffirmativeFields = AssertTrue<
  UnavailablePublicProFact extends AffirmativePublicProFact ? false : true
>;

const affirmativeCompileContract: readonly [
  AffirmativeFieldsUseApprovedFact,
  UnavailableCannotPopulateAffirmativeFields,
] = [true, true];

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderIt = reactServer ? ((() => undefined) as unknown as typeof it) : it;

const renderProPage = async () => {
  const [{ renderToStaticMarkup }, { default: ProPage }] = await Promise.all([
    import('react-dom/server'),
    import('@/app/(public)/pro/page'),
  ]);
  return renderToStaticMarkup(React.createElement(ProPage));
};

const renderProSuite = async (variant?: 'home' | 'pro') => {
  const [{ renderToStaticMarkup }, { ProSuiteSection }] = await Promise.all([
    import('react-dom/server'),
    import('@/components/site/home/ProSuiteSection'),
  ]);
  return renderToStaticMarkup(ProSuiteSection(variant ? { variant } : undefined));
};

if (reactServer) {
  it('runs PRO operating-model render contracts under the client React export condition', () => {
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

describe('PRO route metadata', () => {
  it('publishes a route-specific title, description, and canonical URL', () => {
    assert.match(pageSource, /export const metadata: Metadata = \{/u);
    assert.match(pageSource, /title: 'Mandoob for PROs'/u);
    assert.match(pageSource, /description:\s*'[^']*one assigned Company[^']*'/u);
    assert.match(pageSource, /alternates: \{ canonical: 'https:\/\/mandoob\.ae\/pro' \}/u);
  });
});

describe('centralized PRO content contract', () => {
  it('keeps compact and dark PRO content on AA text/surface tokens', () => {
    assert.match(
      proCss,
      /\.site-public \.hero--pro \+ \.stats-band \.hero__statL\s*\{[^}]*color:\s*var\(--public-text-muted\)/u,
    );
    assert.match(
      proCss,
      /\.site-public \.pro-capabilities__mosaic \.cell > p\[data-source-state='unavailable'\]\s*\{[^}]*color:\s*var\(--public-text-muted\)/u,
    );
    assert.match(
      proCss,
      /\.site-public \.pro-capabilities__mosaic \.cell__mark--plat\s*\{[^}]*color:\s*var\(--accent-ink\)/u,
    );
    assert.match(
      proCss,
      /\.dark \.site-public \.pro-capabilities__mosaic\s*\{[^}]*background:\s*var\(--public-surface-elevated\)/u,
    );
    assert.match(
      proCss,
      /\.site-public \.frame--pro \.ffeed__label\s*\{[^}]*color:\s*var\(--ink-inv\)/u,
    );
  });

  it('types affirmative fields as approved facts and rejects unavailable substitutions', () => {
    assert.deepEqual(affirmativeCompileContract, [true, true]);
    assert.ok(
      [
        PUBLIC_PRO_CONTENT.hero.breadcrumb,
        PUBLIC_PRO_CONTENT.hero.eyebrow,
        PUBLIC_PRO_CONTENT.hero.title,
        PUBLIC_PRO_CONTENT.hero.accent,
        PUBLIC_PRO_CONTENT.hero.description,
        PUBLIC_PRO_CONTENT.policy.label,
        PUBLIC_PRO_CONTENT.audience.eyebrow,
        PUBLIC_PRO_CONTENT.audience.title,
        PUBLIC_PRO_CONTENT.audience.description,
        PUBLIC_PRO_CONTENT.capabilities.eyebrow,
        PUBLIC_PRO_CONTENT.capabilities.title,
        PUBLIC_PRO_CONTENT.capabilities.description,
        PUBLIC_PRO_CONTENT.process.eyebrow,
        PUBLIC_PRO_CONTENT.process.title,
        PUBLIC_PRO_CONTENT.process.description,
      ].every((fact) => fact.source.state === 'approved-static'),
    );
    assert.ok(
      PUBLIC_PRO_CONTENT.hero.links.every((link) => link.label.source.state === 'approved-static'),
    );
    assert.ok(
      PUBLIC_PRO_CONTENT.policy.items.every(
        (item) =>
          item.term.source.state === 'approved-static' &&
          item.detail.source.state === 'approved-static',
      ),
    );
    assert.ok(
      PUBLIC_PRO_CONTENT.audience.items.every(
        (item) =>
          item.title.source.state === 'approved-static' &&
          item.description.source.state === 'approved-static',
      ),
    );
    assert.ok(
      PUBLIC_PRO_CONTENT.capabilities.items.every(
        (item) =>
          item.title.source.state === 'approved-static' &&
          item.summary.source.state === 'approved-static' &&
          item.facts.every((fact) => fact.source.state === 'approved-static'),
      ),
    );
    assert.ok(
      PUBLIC_PRO_CONTENT.process.steps.every(
        (step) =>
          step.title.source.state === 'approved-static' &&
          step.description.source.state === 'approved-static',
      ),
    );
  });

  it('deeply freezes hero, fit, capability, and ordered process content', () => {
    assert.equal(Object.isFrozen(PUBLIC_PRO_CONTENT), true);
    assert.equal(Object.isFrozen(PUBLIC_PRO_CONTENT.hero), true);
    assert.equal(Object.isFrozen(PUBLIC_PRO_CONTENT.policy.items), true);
    assert.equal(Object.isFrozen(PUBLIC_PRO_CONTENT.audience.items[0]), true);
    assert.equal(Object.isFrozen(PUBLIC_PRO_CONTENT.capabilities.items), true);
    assert.equal(Object.isFrozen(PUBLIC_PRO_CONTENT.process.steps[0]), true);
    assert.throws(() => {
      (PUBLIC_PRO_CONTENT.process.steps as unknown as { id: string }[])[0].id = 'replacement';
    }, TypeError);
  });

  it('defines the exact six-step one-Company process and five asymmetric capability groups', () => {
    assert.deepEqual(
      PUBLIC_PRO_CONTENT.process.steps.map((step) => step.id),
      processIds,
    );
    assert.deepEqual(
      PUBLIC_PRO_CONTENT.capabilities.items.map((item) => item.id),
      capabilityIds,
    );
    assert.ok(
      PUBLIC_PRO_CONTENT.process.steps.every(
        (step) => step.description.source.state === 'approved-static',
      ),
    );
  });

  it('keeps approved capabilities distinct from unavailable provider and delivery facts', () => {
    const foundations = PUBLIC_PRO_CONTENT.capabilities.items.find(
      (item) => item.id === 'company-foundations',
    );
    const finance = PUBLIC_PRO_CONTENT.capabilities.items.find(
      (item) => item.id === 'invoices-payments',
    );
    const communication = PUBLIC_PRO_CONTENT.process.steps.find(
      (step) => step.id === 'configured-communication',
    );

    assert.ok(foundations);
    assert.ok(finance);
    assert.ok(communication);
    assert.deepEqual(
      foundations.facts.map((fact) => fact.source.state),
      ['approved-static', 'approved-static'],
    );
    assert.deepEqual(
      finance.facts.map((fact) => fact.source.state),
      ['approved-static'],
    );
    assert.equal(foundations.availability?.source.state, 'unavailable');
    assert.equal(finance.availability?.source.state, 'unavailable');
    assert.match(finance.facts[0].text, /invoice.*payment workflow/iu);
    assert.match(
      finance.availability?.text ?? '',
      /checkout.*provider.*transaction.*confirmation/iu,
    );
    assert.equal(communication.description.source.state, 'approved-static');
    assert.equal(communication.availability?.source.state, 'unavailable');
    assert.match(communication.availability?.text ?? '', /configured channels.*when available/iu);
    assert.equal(PUBLIC_PRO_CONTENT.process.availabilityNote.source.state, 'unavailable');
    assert.match(
      PUBLIC_PRO_CONTENT.process.availabilityNote.text,
      /provider and API availability/iu,
    );
  });

  it('retains all eight required operational capability concepts across five mosaic groups', () => {
    const contractCopy = PUBLIC_PRO_CONTENT.capabilities.items
      .flatMap((item) => [
        item.title.text,
        item.summary.text,
        ...item.facts.map((fact) => fact.text),
        item.availability?.text ?? '',
      ])
      .join(' ');

    for (const concept of capabilityConcepts) {
      assert.match(contractCopy, concept);
    }
  });
});

describe('PRO hero, fit, capabilities, and process rendering', () => {
  renderIt(
    'renders one breadcrumb hero with the frozen one-Company actions and policy band',
    async () => {
      const html = await renderProPage();

      assert.equal((html.match(/<h1\b/gu) ?? []).length, 1);
      assert.match(html, /<nav[^>]*aria-label="Breadcrumb"/u);
      assert.match(html, /<li aria-current="page">For PROs<\/li>/u);
      assert.match(html, /at most one active assigned Company/iu);
      assert.match(html, /<a[^>]*href="\/pricing"[^>]*>Explore plans<\/a>/u);
      assert.match(html, /<a[^>]*href="\/contact"[^>]*>Discuss access<\/a>/u);
      assert.match(html, /aria-label="Mandoob PRO access and assignment policy"/u);
      assert.match(html, /Account verification/iu);
      assert.match(html, /Company assignment/iu);
      assert.match(html, /Company workspace/iu);
      assert.doesNotMatch(
        html.slice(0, html.indexOf('id="pro-fit"')),
        /\bLIVE\b|IMMUTABLE|ISOLATED/iu,
      );
    },
  );

  renderIt(
    'renders a dedicated verified-UAE-PRO fit region with explicit access boundaries',
    async () => {
      const html = await renderProPage();
      const start = html.indexOf('id="pro-fit"');
      const end = html.indexOf('</section>', start);
      const section = html.slice(start, end);

      assert.ok(start >= 0);
      assert.match(section, /verified UAE PRO operations/iu);
      assert.match(section, /Company administration/iu);
      assert.match(section, /verification.*assignment.*required/iu);
      assert.match(section, /at most one active assigned Company/iu);
      assert.match(section, /not an open marketplace/iu);
      assert.match(section, /not automatic/iu);
      assert.match(section, /not.*certification/iu);
      assert.doesNotMatch(section, /href="\/register\/pro/iu);
    },
  );

  renderIt(
    'renders the PRO-only operational suite in the established asymmetric five-cell mosaic',
    async () => {
      const html = await renderProPage();
      const start = html.indexOf('id="pro-capabilities"');
      const end = html.indexOf('</section>', start);
      const section = html.slice(start, end);

      assert.match(section, /<ul[^>]*class="mosaic pro-capabilities__mosaic"/u);
      assert.equal((section.match(/data-pro-capability=/gu) ?? []).length, 5);
      for (const item of PUBLIC_PRO_CONTENT.capabilities.items) {
        assert.match(section, new RegExp(`data-pro-capability="${item.id}"`, 'u'));
        assert.match(
          section,
          new RegExp(`>${item.title.text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}<`, 'u'),
        );
      }
      assert.equal((section.match(/class="cell cell--table reveal"/gu) ?? []).length, 1);
      assert.equal((section.match(/class="cell cell--log reveal"/gu) ?? []).length, 1);
      assert.equal((section.match(/class="cell cell--visas reveal"/gu) ?? []).length, 1);
      assert.equal((section.match(/class="cell cell--eid reveal"/gu) ?? []).length, 1);
      assert.equal((section.match(/class="cell cell--renewals reveal"/gu) ?? []).length, 1);
      for (const concept of capabilityConcepts) {
        assert.match(section, concept);
      }
      assert.doesNotMatch(
        section,
        /Acme|\.mandoob\.app|784-|activity\.log|invoice\.paid|\bRLS\b|IMMUTABLE|\bLIVE\b|zero fines|90\s*\/\s*30\s*\/\s*7/iu,
      );
    },
  );

  renderIt('renders source-state qualifications as separate visible facts', async () => {
    const html = await renderProPage();
    const capabilityStart = html.indexOf('id="pro-capabilities"');
    const capabilityEnd = html.indexOf('</section>', capabilityStart);
    const capabilitySection = html.slice(capabilityStart, capabilityEnd);
    const processStart = html.indexOf('id="pro-operating-process"');
    const processEnd = html.indexOf('</section>', processStart);
    const processSection = html.slice(processStart, processEnd);

    assert.match(capabilitySection, /data-source-state="approved-static"/u);
    assert.match(capabilitySection, /data-source-state="unavailable"/u);
    assert.match(
      capabilitySection,
      /data-source-state="approved-static"[^>]*>[^<]*invoice[^<]*payment workflow/iu,
    );
    assert.match(
      capabilitySection,
      /data-source-state="unavailable"[^>]*>[^<]*checkout[^<]*provider[^<]*transaction/iu,
    );
    assert.match(processSection, /data-source-state="approved-static"/u);
    assert.match(processSection, /data-source-state="unavailable"/u);
    assert.match(processSection, /provider and API availability/iu);
    const unavailableTags = [
      ...capabilitySection.matchAll(/<p([^>]*)data-source-state="unavailable"[^>]*>/gu),
      ...processSection.matchAll(/<p([^>]*)data-source-state="unavailable"[^>]*>/gu),
    ];
    assert.ok(unavailableTags.length >= 3);
    for (const [, attributes] of unavailableTags) {
      assert.match(
        attributes,
        /class="(?:pro-capabilities__qualification|pro-process__qualification|pro-process__availability)"/u,
      );
    }
  });

  renderIt(
    'renders exactly six ordered operating steps with qualified channel availability',
    async () => {
      const html = await renderProPage();
      const start = html.indexOf('id="pro-operating-process"');
      const end = html.indexOf('</section>', start);
      const section = html.slice(start, end);

      assert.match(section, /<ol[^>]*class="pro-process__list"/u);
      assert.equal((section.match(/data-pro-process-step=/gu) ?? []).length, 6);
      let previous = -1;
      for (const step of PUBLIC_PRO_CONTENT.process.steps) {
        const position = section.indexOf(`data-pro-process-step="${step.id}"`);
        assert.ok(position > previous, `${step.id} must follow the preceding process step`);
        previous = position;
        assert.match(
          section,
          new RegExp(`>${step.title.text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}<`, 'u'),
        );
      }
      assert.match(section, /configured channels.*when available/iu);
      assert.match(section, /provider and API availability/iu);
      assert.doesNotMatch(section, /href="\/register\/pro/iu);
    },
  );

  renderIt('keeps the full Slice 6 output free of retired operating-model claims', async () => {
    const html = await renderProPage();
    const end = html.indexOf('<section', html.indexOf('id="pro-operating-process"') + 1);
    const sliceSixHtml = html.slice(0, end);

    assert.doesNotMatch(
      sliceSixHtml,
      /\bClient(?:s)?\b|multi-company|Company switcher|team capacity|PRO-owned leads|lead board|guaranteed|fully compliant|100% secure/iu,
    );
    assert.doesNotMatch(sliceSixHtml, /href="\/register\/pro/iu);
  });
});

describe('PRO composition and scoped theme contract', () => {
  it('retires homepage-owned mounts only from the PRO page', () => {
    assert.doesNotMatch(pageSource, /TrustBandSection/u);
    assert.match(pageSource, /<ProSuiteSection variant="pro" \/>/u);
    assert.match(pageSource, /ProAudienceFitSection/u);
    assert.doesNotMatch(pageSource, /ProCapabilitiesSection/u);
    assert.match(pageSource, /ProOperatingProcessSection/u);
  });

  renderIt(
    'keeps the default shared suite render identical to its explicit homepage variant',
    async () => {
      const defaultHtml = await renderProSuite();
      assert.equal(defaultHtml, await renderProSuite('home'));
      assert.match(defaultHtml, /<section id="pro-suite" class="section"/u);
      assert.match(defaultHtml, /<ul class="mosaic"/u);
      assert.equal((defaultHtml.match(/class="cell cell--/gu) ?? []).length, 5);
      assert.match(defaultHtml, /Built for a PRO working in one assigned company\./u);
      assert.match(defaultHtml, /Acme Trading FZ-LLC/u);
    },
  );

  it('uses exhaustive ID-keyed icon records instead of item-index coupling', () => {
    assert.match(audienceSource, /satisfies Record<PublicProAudienceId,/u);
    assert.match(audienceSource, /audienceIcons\[item\.id\]/u);
    assert.doesNotMatch(audienceSource, /icons\[index\]|map\(\(item, index\)/u);
    assert.match(processSource, /satisfies Record<PublicProProcessId,/u);
    assert.match(processSource, /processIcons\[step\.id\]/u);
    assert.doesNotMatch(processSource, /processIcons\[index\]/u);
  });

  it('uses only the existing PRO hero image and centralized hero content', () => {
    assert.match(heroSource, /PUBLIC_PRO_CONTENT\.hero/u);
    assert.match(cssSource, /url\('\/hero\/pro-firm-operations\.webp'\)/u);
    assert.doesNotMatch(heroSource, /<Image|src=/u);
  });

  it('scopes logical light-dark desktop styles and keeps a smaller-screen fallback', () => {
    assert.ok(proCssStart >= 0);
    assert.ok(proCss.length > 100);
    assert.match(proCss, /\.site-public \.pro-fit/u);
    assert.match(proCss, /\.site-public \.pro-capabilities__mosaic/u);
    assert.doesNotMatch(proCss, /\.site-public \.pro-capabilities__grid/u);
    assert.match(proCss, /\.site-public \.pro-process__list/u);
    assert.match(
      proCss,
      /\.site-public \.pro-bento\s*\{[^}]*background:\s*var\(--public-surface-elevated\)/u,
    );
    assert.match(proCss, /\.dark \.site-public \.pro-/u);
    assert.match(proCss, /@media \(max-width: 899px\)/u);
    assert.match(
      proCss,
      /@media \(max-width: 899px\)[\s\S]*?\.site-public \.pro-process__qualification\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*4;/u,
    );
    assert.match(proCss, /(?:margin|padding|inset|border)-(?:inline|block)/u);
    assert.doesNotMatch(proCss, /\b(?:margin|padding)-(?:left|right):|\b(?:left|right):/u);
    assert.doesNotMatch(proCss, /(?:inline-size|width):\s*100vw/u);
  });

  it('uses only declared public-theme tokens in the Slice 6 CSS block', () => {
    const declaredTokens = new Set(
      [...cssSource.matchAll(/(--[a-z0-9-]+)\s*:/giu)].map((match) => match[1]),
    );
    const usedTokens = new Set(
      [...proCss.matchAll(/var\((--[a-z0-9-]+)/giu)].map((match) => match[1]),
    );
    const undefinedTokens = [...usedTokens].filter((token) => !declaredTokens.has(token)).sort();

    assert.deepEqual(
      undefinedTokens,
      [],
      `Undefined PRO CSS tokens: ${undefinedTokens.join(', ')}`,
    );
  });
});
