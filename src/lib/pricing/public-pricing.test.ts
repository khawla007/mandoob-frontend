import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ACCEPTED_NUMERIC_PRICE_SOURCE_IDS,
  PUBLIC_PRICING_CONTRACT,
  PUBLIC_PRICING_SOURCE_STATES,
  formatPublicPrice,
  type PublicPrice,
} from './public-pricing';

const pricingPageSource = readFileSync(
  new URL('../../app/(public)/pricing/page.tsx', import.meta.url),
  'utf8',
);

if (false) {
  const unauthorizedPrice: PublicPrice = {
    state: 'live',
    // @ts-expect-error no live or approved numeric price source is currently accepted
    sourceId: 'arbitrary-source',
    currency: 'AED',
    minorUnits: 12_500,
  };
  void unauthorizedPrice;
  // @ts-expect-error the published contract is deeply readonly
  PUBLIC_PRICING_CONTRACT.tiers[0].cadences.push({});
  // @ts-expect-error nested contract facts cannot be reassigned
  PUBLIC_PRICING_CONTRACT.tiers[0].cadences[0].availability.display = 'Subject to confirmation';
}

describe('public pricing presentation contract', () => {
  it('centralizes publication-summary facts with their approved or unavailable source state', () => {
    const summary = PUBLIC_PRICING_CONTRACT.publicationSummary;
    assert.equal(summary.companyPolicy.text, 'At most one active Company per PRO');
    assert.equal(summary.companyPolicy.source.state, 'approved-static');
    assert.equal(summary.billingConcepts.source.state, 'approved-static');
    assert.equal(summary.currentAvailability.source.state, 'unavailable');
    assert.equal(summary.confirmationNotice.source.state, 'unavailable');
    assert.equal(summary.categoryAllocationNotice.source.state, 'unavailable');
    assert.equal(summary.separateCostsNotice.source.state, 'approved-static');
    assert.doesNotMatch(JSON.stringify(summary), /One active assignment/u);
  });

  it('provides the exact approved tier order', () => {
    assert.deepEqual(
      PUBLIC_PRICING_CONTRACT.tiers.map((tier) => tier.name),
      ['Starter', 'Professional', 'Enterprise'],
    );
  });

  it('keeps every tier limited to at most one active Company per PRO', () => {
    for (const tier of PUBLIC_PRICING_CONTRACT.tiers) {
      assert.equal(tier.activeCompanyLimit, 1, tier.name);
      assert.match(tier.companyPolicy, /one active Company per PRO/iu, tier.name);
    }
  });

  it('defines the four discriminated source states', () => {
    assert.deepEqual(PUBLIC_PRICING_SOURCE_STATES, [
      'live',
      'approved-static',
      'illustrative',
      'unavailable',
    ]);

    for (const tier of PUBLIC_PRICING_CONTRACT.tiers) {
      assert.equal(tier.source.state, 'approved-static');
      assert.equal(tier.price.state, 'unavailable');
    }
  });

  it('requires AED, explicit currency, and integer minor units for numeric prices', () => {
    assert.deepEqual(ACCEPTED_NUMERIC_PRICE_SOURCE_IDS, []);
    assert.equal(Object.isFrozen(ACCEPTED_NUMERIC_PRICE_SOURCE_IDS), true);
    assert.throws(() => {
      (ACCEPTED_NUMERIC_PRICE_SOURCE_IDS as unknown as string[]).push('arbitrary-source');
    }, TypeError);
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'illustrative',
          label: 'Illustrative',
          currency: 'USD',
          minorUnits: 12_500,
        } as unknown as PublicPrice),
      /must use AED/iu,
    );
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'approved-static',
          sourceId: 'arbitrary-source',
          currency: 'USD',
          minorUnits: 12_500,
        } as unknown as PublicPrice),
      /accepted numeric price source/iu,
    );
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'illustrative',
          label: 'Illustrative',
          currency: 'AED',
          minorUnits: 12.5,
        }),
      /integer minor units/iu,
    );
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'approved-static',
          sourceId: '',
          currency: 'AED',
          minorUnits: 12_500,
        } as unknown as PublicPrice),
      /accepted numeric price source/iu,
    );
  });

  it('rejects negative or unsafe numeric minor units', () => {
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'illustrative',
          label: 'Illustrative',
          currency: 'AED',
          minorUnits: -1,
        }),
      /nonnegative safe integer minor units/iu,
    );
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'illustrative',
          label: 'Illustrative',
          currency: 'AED',
          minorUnits: Number.MAX_SAFE_INTEGER + 1,
        }),
      /nonnegative safe integer minor units/iu,
    );
  });

  it('renders unavailable production prices as Price on request', () => {
    for (const tier of PUBLIC_PRICING_CONTRACT.tiers) {
      assert.equal(formatPublicPrice(tier.price), 'Price on request');
    }
  });

  it('keeps illustrative numeric pricing visibly labelled at the render boundary', () => {
    assert.equal(
      formatPublicPrice({
        state: 'illustrative',
        label: 'Illustrative',
        currency: 'AED',
        minorUnits: 12_500,
      }),
      'Illustrative: AED 125',
    );
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'illustrative',
          label: '   ',
          currency: 'AED',
          minorUnits: 12_500,
        }),
      /nonempty illustrative label/iu,
    );
  });

  it('offers monthly and annual cadence concepts without discount claims', () => {
    for (const tier of PUBLIC_PRICING_CONTRACT.tiers) {
      assert.deepEqual(
        tier.cadences.map((cadence) => cadence.name),
        ['monthly', 'annual'],
      );
      for (const cadence of tier.cadences) {
        assert.equal(cadence.concept.state, 'approved-static');
        assert.equal(cadence.availability.state, 'unavailable');
        assert.equal(cadence.availability.display, 'Subject to confirmation');
      }
    }

    assert.doesNotMatch(
      JSON.stringify(PUBLIC_PRICING_CONTRACT),
      /discount|saving|percent|price lock|crossed-out/iu,
    );
  });

  it('keeps the pricing page free of local price and allocation fixtures', () => {
    assert.match(pricingPageSource, /PUBLIC_PRICING_CONTRACT/u);
    assert.match(pricingPageSource, /formatPublicPrice/u);
    assert.match(pricingPageSource, /PUBLIC_PRICING_CONTRACT\.tiers\.map/u);
    assert.match(pricingPageSource, /\{plan\.name\}/u);
    assert.match(pricingPageSource, /formatPublicPrice\(plan\.price\)/u);
    assert.doesNotMatch(pricingPageSource, /\bconst\s+plans\s*=/u);
    assert.doesNotMatch(pricingPageSource, /\bUSD\b|\b(?:4900|9900|19900)\b/u);
    assert.doesNotMatch(pricingPageSource, /\/\s*month\b|\/month\b/iu);
    assert.doesNotMatch(
      pricingPageSource,
      /features\s*:\s*\[|WhatsApp\s*\+\s*SMS|Priority support|Renewal alerts/iu,
    );
  });

  it('keeps allowances and add-ons at category level', () => {
    assert.deepEqual(PUBLIC_PRICING_CONTRACT.differentiationCategories, [
      'Platform features',
      'Storage and documents',
      'Communication allowances',
      'Reporting and audit visibility',
      'Support',
    ]);
    assert.deepEqual(
      PUBLIC_PRICING_CONTRACT.addOns.map((addOn) => addOn.category),
      ['Communication usage'],
    );
    assert.ok(
      PUBLIC_PRICING_CONTRACT.tiers.every(
        (tier) =>
          tier.categories.length === PUBLIC_PRICING_CONTRACT.differentiationCategories.length &&
          tier.categories.every(
            (category, index) =>
              category.length > 0 &&
              category === PUBLIC_PRICING_CONTRACT.differentiationCategories[index],
          ),
      ),
    );
  });

  it('keeps tier identifiers paired with their approved names', () => {
    assert.deepEqual(
      PUBLIC_PRICING_CONTRACT.tiers.map(({ id, name }) => [id, name]),
      [
        ['starter', 'Starter'],
        ['professional', 'Professional'],
        ['enterprise', 'Enterprise'],
      ],
    );
  });

  it('deeply freezes the production contract and rejects mutation', () => {
    const assertDeeplyFrozen = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return;
      assert.equal(Object.isFrozen(value), true);
      for (const child of Object.values(value)) assertDeeplyFrozen(child);
    };

    assertDeeplyFrozen(PUBLIC_PRICING_CONTRACT);
    assert.throws(() => {
      (PUBLIC_PRICING_CONTRACT.tiers as unknown as Array<unknown>).push({});
    }, TypeError);
    assert.throws(() => {
      (PUBLIC_PRICING_CONTRACT.tiers[0].cadences[0].availability as { display: string }).display =
        'Available';
    }, TypeError);
  });

  it('separates software access, government and authority costs, and third-party costs', () => {
    assert.equal(PUBLIC_PRICING_CONTRACT.costBoundaries.softwareAccess.inPlan, true);
    assert.deepEqual(PUBLIC_PRICING_CONTRACT.costBoundaries.governmentAndAuthority.categories, [
      'Company registration',
      'Government and authority fees',
      'Visa, medical, and Emirates ID',
    ]);
    assert.deepEqual(PUBLIC_PRICING_CONTRACT.costBoundaries.thirdParty.categories, [
      'Office',
      'Banking',
      'Tax and VAT',
      'Translation and attestation',
      'Payment-provider charges',
      'Communication usage',
      'Optional professional services',
    ]);
  });

  it('contains no invented allocation, price, or provider truth', () => {
    const serialized = JSON.stringify(PUBLIC_PRICING_CONTRACT);

    assert.ok(PUBLIC_PRICING_CONTRACT.tiers.every((tier) => tier.price.state === 'unavailable'));
    assert.doesNotMatch(
      serialized,
      /\b(?:unit|seat|user|gigabyte|SLA|Stripe|Tap|WhatsApp)\b|message count|response time|included price/iu,
    );
    assert.doesNotMatch(serialized, /minorUnits|currency|providerName/iu);
  });
});
