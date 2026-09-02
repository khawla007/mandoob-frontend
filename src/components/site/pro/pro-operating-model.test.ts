import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import React from 'react';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';

const pageSource = readFileSync(
  new URL('../../../app/(public)/pro/page.tsx', import.meta.url),
  'utf8',
);
const heroSource = readFileSync(new URL('./ProHeroSection.tsx', import.meta.url), 'utf8');
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
  'legal-company-profile',
  'employees-visa-eid',
  'documents-storage',
  'renewals',
  'invoices-payments',
  'branding-contact',
  'audit-visibility',
  'portal-context',
] as const;

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderIt = reactServer ? ((() => undefined) as unknown as typeof it) : it;

const renderProPage = async () => {
  const [{ renderToStaticMarkup }, { default: ProPage }] = await Promise.all([
    import('react-dom/server'),
    import('@/app/(public)/pro/page'),
  ]);
  return renderToStaticMarkup(React.createElement(ProPage));
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

describe('centralized PRO content contract', () => {
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

  it('defines the exact six-step one-Company process and safe capability coverage', () => {
    assert.deepEqual(
      PUBLIC_PRO_CONTENT.process.steps.map((step) => step.id),
      processIds,
    );
    assert.deepEqual(
      PUBLIC_PRO_CONTENT.capabilities.items.map((item) => item.id),
      capabilityIds,
    );
    assert.ok(
      PUBLIC_PRO_CONTENT.process.steps.every((step) => step.source.state === 'approved-static'),
    );
    assert.ok(
      PUBLIC_PRO_CONTENT.capabilities.items.every(
        (item) => item.source.state === 'approved-static',
      ),
    );
    assert.match(
      PUBLIC_PRO_CONTENT.process.steps[4].description,
      /configured channels.*when available/iu,
    );
    assert.match(
      PUBLIC_PRO_CONTENT.capabilities.items.find((item) => item.id === 'invoices-payments')!
        .description,
      /provider.*availability/iu,
    );
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
    'renders the PRO-only operational capability suite without samples or proof claims',
    async () => {
      const html = await renderProPage();
      const start = html.indexOf('id="pro-capabilities"');
      const end = html.indexOf('</section>', start);
      const section = html.slice(start, end);

      assert.equal((section.match(/data-pro-capability=/gu) ?? []).length, capabilityIds.length);
      for (const item of PUBLIC_PRO_CONTENT.capabilities.items) {
        assert.match(section, new RegExp(`data-pro-capability="${item.id}"`, 'u'));
        assert.match(
          section,
          new RegExp(`>${item.title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}<`, 'u'),
        );
      }
      assert.doesNotMatch(
        section,
        /Acme|\.mandoob\.app|784-|activity\.log|invoice\.paid|\bRLS\b|IMMUTABLE|\bLIVE\b|zero fines|90\s*\/\s*30\s*\/\s*7/iu,
      );
    },
  );

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
          new RegExp(`>${step.title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}<`, 'u'),
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
    assert.doesNotMatch(pageSource, /ProSuiteSection/u);
    assert.match(pageSource, /ProAudienceFitSection/u);
    assert.match(pageSource, /ProCapabilitiesSection/u);
    assert.match(pageSource, /ProOperatingProcessSection/u);
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
    assert.match(proCss, /\.site-public \.pro-capabilities__grid/u);
    assert.match(proCss, /\.site-public \.pro-process__list/u);
    assert.match(proCss, /\.dark \.site-public \.pro-/u);
    assert.match(proCss, /@media \(max-width: 899px\)/u);
    assert.match(proCss, /(?:margin|padding|inset|border)-(?:inline|block)/u);
    assert.doesNotMatch(proCss, /\b(?:margin|padding)-(?:left|right):|\b(?:left|right):/u);
    assert.doesNotMatch(proCss, /(?:inline-size|width):\s*100vw/u);
  });
});
