import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  PUBLIC_PRICING_CONTRACT,
  PUBLIC_PRICING_SOURCE_STATES,
  formatPublicPrice,
  type PublicPrice,
} from './public-pricing';

const pricingPageSource = readFileSync(
  new URL('../../app/(public)/pricing/page.tsx', import.meta.url),
  'utf8',
);

describe('public pricing presentation contract', () => {
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
    const approvedPrice: PublicPrice = {
      state: 'approved-static',
      source: 'Accepted test fixture',
      currency: 'AED',
      minorUnits: 12_500,
    };

    assert.equal(approvedPrice.source, 'Accepted test fixture');
    assert.equal(formatPublicPrice(approvedPrice), 'AED 125');
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'approved-static',
          source: 'Accepted test fixture',
          currency: 'USD',
          minorUnits: 12_500,
        } as unknown as PublicPrice),
      /AED/iu,
    );
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'approved-static',
          source: 'Accepted test fixture',
          currency: 'AED',
          minorUnits: 12.5,
        }),
      /integer minor units/iu,
    );
    assert.throws(
      () =>
        formatPublicPrice({
          state: 'approved-static',
          currency: 'AED',
          minorUnits: 12_500,
        } as PublicPrice),
      /accepted source provenance/iu,
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
      PUBLIC_PRICING_CONTRACT.tiers.every((tier) =>
        tier.categories.every((category) => typeof category === 'string'),
      ),
    );
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
