import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import React from 'react';

import {
  ACCEPTED_USAGE_BASED_TIER_ALLOCATION_EVIDENCE,
  PUBLIC_PRICING_COMPARISON_STATUSES,
  PUBLIC_PRICING_CONTRACT,
  freezePublicPricingUsageBasedAllocationEvidenceRegistry,
  matchesUsageBasedTierAllocationEvidence,
  resolvePublicComparisonStatus,
  type PublicPricingComparisonAllocation,
  type PublicPricingUsageBasedAllocationEvidence,
} from '@/lib/pricing/public-pricing';

if (false) {
  const evidence: PublicPricingUsageBasedAllocationEvidence = {
    id: 'reviewed-starter-communications',
    tierId: 'starter',
    capabilityGroup: 'Communication allowances',
  };
  // @ts-expect-error allocation evidence ids are immutable
  evidence.id = 'replacement';
  // @ts-expect-error allocation evidence tier bindings are immutable
  evidence.tierId = 'professional';
  // @ts-expect-error allocation evidence capability bindings are immutable
  evidence.capabilityGroup = 'Support';
  // @ts-expect-error the accepted evidence registry is immutable
  ACCEPTED_USAGE_BASED_TIER_ALLOCATION_EVIDENCE.push(evidence);
}

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

const requiredGroups = [
  'Company workspace',
  'Documents and storage',
  'Renewals',
  'Invoices and payments',
  'Communication allowances',
  'Reporting and audit',
  'Branding',
  'Support',
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
  it('runs pricing comparison render contracts under the client React export condition', () => {
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

describe('pricing comparison contract', () => {
  it('centralizes exactly three tier columns and all required capability groups', () => {
    assert.equal('tierIds' in PUBLIC_PRICING_CONTRACT.comparison, false);
    const tierIds = PUBLIC_PRICING_CONTRACT.tiers.map((tier) => tier.id);
    assert.deepEqual(tierIds, ['starter', 'professional', 'enterprise']);
    assert.deepEqual(
      PUBLIC_PRICING_CONTRACT.comparison.rows.map((row) => row.group),
      requiredGroups,
    );
    for (const row of PUBLIC_PRICING_CONTRACT.comparison.rows) {
      assert.deepEqual(Object.keys(row.tiers), tierIds, row.group);
    }
  });

  it('uses only approved visible statuses and fails closed for unapproved allocations', () => {
    assert.deepEqual(PUBLIC_PRICING_COMPARISON_STATUSES, [
      'Included',
      'Configurable',
      'Usage-based',
      'Unavailable',
      'Contact',
    ]);

    for (const row of PUBLIC_PRICING_CONTRACT.comparison.rows) {
      for (const tier of PUBLIC_PRICING_CONTRACT.tiers) {
        const allocation = row.tiers[tier.id];
        const visibleStatus = resolvePublicComparisonStatus(allocation, {
          tierId: tier.id,
          capabilityGroup: row.group,
        });
        assert.ok(PUBLIC_PRICING_COMPARISON_STATUSES.includes(visibleStatus));
        if (allocation.source.state === 'unavailable') assert.equal(visibleStatus, 'Contact');
      }
    }

    assert.equal(
      resolvePublicComparisonStatus(
        {
          status: 'Included',
          source: { state: 'unavailable', reason: 'Allocation is not approved' },
        } as never,
        { tierId: 'starter', capabilityGroup: 'Company workspace' },
      ),
      'Contact',
    );

    const communication = PUBLIC_PRICING_CONTRACT.comparison.rows.find(
      (row) => row.group === 'Communication allowances',
    );
    assert.ok(communication);
    for (const tier of PUBLIC_PRICING_CONTRACT.tiers) {
      const allocation: PublicPricingComparisonAllocation = communication.tiers[tier.id];
      assert.equal(allocation.source.state, 'unavailable');
      assert.equal(
        resolvePublicComparisonStatus(allocation, {
          tierId: tier.id,
          capabilityGroup: communication.group,
        }),
        'Contact',
      );
    }
    assert.ok(
      PUBLIC_PRICING_CONTRACT.comparison.rows.every((row) =>
        PUBLIC_PRICING_CONTRACT.tiers.every(
          (tier) =>
            resolvePublicComparisonStatus(row.tiers[tier.id], {
              tierId: tier.id,
              capabilityGroup: row.group,
            }) !== 'Usage-based',
        ),
      ),
      'A per-tier Usage-based status requires accepted allocation-specific evidence',
    );
    assert.deepEqual(ACCEPTED_USAGE_BASED_TIER_ALLOCATION_EVIDENCE, []);
    assert.equal(Object.isFrozen(ACCEPTED_USAGE_BASED_TIER_ALLOCATION_EVIDENCE), true);
    const frozenEvidence = freezePublicPricingUsageBasedAllocationEvidenceRegistry([
      {
        id: 'reviewed-starter-communications',
        tierId: 'starter',
        capabilityGroup: 'Communication allowances',
      },
    ] as const);
    assert.equal(Object.isFrozen(frozenEvidence), true);
    assert.equal(Object.isFrozen(frozenEvidence[0]), true);
    assert.throws(() => {
      (frozenEvidence[0] as { id: string }).id = 'replacement';
    }, TypeError);
    assert.equal(
      resolvePublicComparisonStatus(
        {
          status: 'Usage-based',
          source: { state: 'approved-static', source: 'Category-level add-on concept only' },
        } as never,
        { tierId: 'starter', capabilityGroup: 'Communication allowances' },
      ),
      'Contact',
      'Category-level add-on approval must not publish a per-tier Usage-based allocation',
    );

    const allocation = {
      status: 'Usage-based',
      evidenceId: 'reviewed-starter-communications',
      tierId: 'starter',
      capabilityGroup: 'Communication allowances',
      source: { state: 'approved-static', source: 'Reviewed allocation evidence' },
    } as const;
    const evidence = {
      id: 'reviewed-starter-communications',
      tierId: 'starter',
      capabilityGroup: 'Communication allowances',
    } as const;
    assert.equal(matchesUsageBasedTierAllocationEvidence(allocation, allocation, evidence), true);
    assert.equal(
      matchesUsageBasedTierAllocationEvidence(
        allocation,
        { tierId: 'professional', capabilityGroup: 'Communication allowances' },
        evidence,
      ),
      false,
      'Evidence for one tier cannot authorize another tier',
    );
    assert.equal(
      matchesUsageBasedTierAllocationEvidence(
        allocation,
        { tierId: 'starter', capabilityGroup: 'Support' },
        evidence,
      ),
      false,
      'Evidence for one capability group cannot authorize another group',
    );
    assert.equal(PUBLIC_PRICING_CONTRACT.addOns[0].category, 'Communication usage');
    assert.equal(PUBLIC_PRICING_CONTRACT.addOns[0].basis.text, 'Usage-based');
    assert.equal(PUBLIC_PRICING_CONTRACT.addOns[0].basis.source.state, 'approved-static');
  });

  it('keeps cost categories and variability in the centralized contract without exact fees', () => {
    const { costBoundaries } = PUBLIC_PRICING_CONTRACT;
    assert.deepEqual(costBoundaries.softwareAccess.categories, ['Workspace access']);
    assert.deepEqual(costBoundaries.governmentAndAuthority.categories, [
      'Company registration',
      'Government and authority fees',
      'Visa, medical, and Emirates ID',
    ]);
    assert.deepEqual(costBoundaries.thirdParty.categories, [
      'Office',
      'Banking',
      'Tax and VAT',
      'Translation and attestation',
      'Payment-provider charges',
      'Communication usage',
      'Optional professional services',
    ]);
    assert.equal(costBoundaries.otherThirdParties.text, 'Other third parties');
    assert.equal(costBoundaries.otherThirdParties.source.state, 'approved-static');
    assert.match(
      costBoundaries.variabilityNotice.text,
      /jurisdiction, activity, office, visa, approval, provider, and current authority schedules/iu,
    );
    assert.equal(costBoundaries.variabilityNotice.source.state, 'approved-static');
    assert.equal(
      costBoundaries.finalEstimateNotice.text,
      'Final Company-setup estimates depend on selected inputs and current schedules.',
    );
    assert.equal(costBoundaries.finalEstimateNotice.source.state, 'approved-static');
    for (const description of [
      costBoundaries.softwareAccess.description,
      costBoundaries.governmentAndAuthority.description,
      costBoundaries.thirdParty.description,
    ]) {
      assert.equal(description.source.state, 'approved-static');
      assert.ok(description.text.length > 20);
    }
    assert.doesNotMatch(
      JSON.stringify(costBoundaries),
      /\b(?:AED|USD)\s*\d|\d[,.]?\d*\s*(?:AED|USD)/iu,
    );
  });
});

describe('pricing comparison and cost-boundary sections', () => {
  renderIt('renders a semantic comparison table with visible non-color status text', async () => {
    const html = await renderPricingPage();
    const tableStart = html.indexOf('<table');
    const tableEnd = html.indexOf('</table>', tableStart);
    const table = html.slice(tableStart, tableEnd);

    assert.ok(tableStart >= 0);
    assert.match(
      table,
      /<caption>Compare approved capability categories across Starter, Professional, and Enterprise\.<\/caption>/u,
    );
    assert.match(table, /<thead>/u);
    assert.match(table, /<tbody>/u);
    assert.equal((table.match(/<th scope="col"/gu) ?? []).length, 4);
    assert.equal((table.match(/<th scope="row"/gu) ?? []).length, requiredGroups.length);
    for (const group of requiredGroups) assert.match(table, new RegExp(`>${group}<`, 'u'));
    for (const tier of PUBLIC_PRICING_CONTRACT.tiers) {
      assert.match(table, new RegExp(`<th scope="col">${tier.name}<`, 'u'));
    }
    assert.equal(
      (table.match(/data-comparison-status=/gu) ?? []).length,
      requiredGroups.length * 3,
    );
    const resolvedStatuses = PUBLIC_PRICING_CONTRACT.comparison.rows.flatMap((row) =>
      PUBLIC_PRICING_CONTRACT.tiers.map((tier) =>
        resolvePublicComparisonStatus(row.tiers[tier.id], {
          tierId: tier.id,
          capabilityGroup: row.group,
        }),
      ),
    );
    for (const status of PUBLIC_PRICING_COMPARISON_STATUSES) {
      const expectedCount = resolvedStatuses.filter((value) => value === status).length;
      const actualCount = (
        table.match(new RegExp(`data-comparison-status="${status}">${status}<\\/span>`, 'gu')) ?? []
      ).length;
      assert.equal(actualCount, expectedCount, `${status} must be visible cell text`);
    }
    assert.doesNotMatch(table, /aria-label="(?:included|contact|usage-based)"/iu);
  });

  renderIt('separates platform access from variable external and additional costs', async () => {
    const html = await renderPricingPage();

    assert.match(html, /<section[^>]*aria-labelledby="pricing-costs-title"/u);
    assert.match(html, />Platform access</u);
    assert.match(html, />Government and authority costs</u);
    assert.match(html, />Additional and third-party costs</u);
    for (const category of [
      'Government and authority fees',
      'Office',
      'Visa, medical, and Emirates ID',
      'Banking',
      'Tax and VAT',
      'Translation and attestation',
      'Payment-provider charges',
      'Communication usage',
      'Optional professional services',
      'Other third parties',
    ]) {
      assert.match(html, new RegExp(`>${category}<`, 'u'));
    }
    assert.match(
      html,
      /Final Company-setup estimates depend on selected inputs and current schedules\./u,
    );
    assert.match(html, /<a[^>]*href="\/estimate"[^>]*>Indicative estimate<\/a>/u);
    assert.doesNotMatch(
      html,
      /\badvisory\b|guaranteed total|binding quote|subscription price|\b(?:AED|USD)\s*\d/iu,
    );
  });

  it('renders both sections from the pricing contract and preserves scoped responsive CSS', () => {
    assert.match(pageSource, /PUBLIC_PRICING_CONTRACT\.comparison\.rows\.map/u);
    assert.match(pageSource, /resolvePublicComparisonStatus/u);
    assert.match(pageSource, /costBoundaries/u);
    assert.match(pageSource, /costBoundaries\.variabilityNotice\.text/u);
    assert.match(pageSource, /costBoundaries\.finalEstimateNotice\.text/u);
    assert.match(pageSource, /costBoundaries\.softwareAccess\.description\.text/u);
    assert.match(pageSource, /costBoundaries\.governmentAndAuthority\.description\.text/u);
    assert.match(pageSource, /costBoundaries\.thirdParty\.description\.text/u);
    assert.doesNotMatch(pageSource, /\badvisory\b/iu);
    assert.doesNotMatch(
      pageSource,
      /\b(?:const|let|var)\s+(?:comparison|comparisonRows|costs)\s*=/u,
    );

    assert.match(pricingCss, /\.site-public \.pricing-comparison/u);
    assert.match(pricingCss, /\.site-public \.pricing-comparison__table-wrap/u);
    assert.match(
      pricingCss,
      /\.site-public \.pricing-comparison__table-wrap\s*\{[^}]*overflow-x:\s*auto/u,
    );
    assert.match(
      pricingCss,
      /\.site-public \.pricing-comparison table\s*\{[^}]*min-inline-size:\s*820px/u,
    );
    assert.match(pricingCss, /\.site-public \.pricing-costs/u);
    assert.match(pricingCss, /\.dark \.site-public \.pricing-comparison/u);
    assert.match(
      pricingCss,
      /\.dark \.site-public \.pricing-comparison__table-wrap,[\s\S]*?border-color:\s*var\(--public-border-strong\)/u,
    );
    assert.match(
      pricingCss,
      /\.dark \.site-public \.pricing-comparison caption,[\s\S]*?border-color:\s*var\(--public-border-strong\)/u,
    );
    assert.match(pricingCss, /@media \(max-width: 899px\)[\s\S]*\.pricing-costs__grid/u);
    assert.match(pricingCss, /(?:margin|padding|inset|border)-(?:inline|block)/u);
    assert.doesNotMatch(pricingCss, /\b(?:margin|padding)-(?:left|right):|\b(?:left|right):/u);
    assert.doesNotMatch(pricingCss, /(?:inline-size|width):\s*100vw/u);
  });
});
