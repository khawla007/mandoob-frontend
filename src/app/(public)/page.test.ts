import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('homepage composition contract', () => {
  it('keeps the protected hero first and the protected final CTA last', () => {
    const orderedSections = [
      '<HeroSection />',
      '<TrustBandSection />',
      '<ServicesSection />',
      '<FlowSection />',
      '<EstimatorSection />',
      '<SupportServicesSection />',
      '<WhyMandoobSection />',
      '<KnowledgeFaqSection />',
      '<FinalCtaSection />',
    ];

    let previousIndex = -1;
    for (const section of orderedSections) {
      const index = pageSource.indexOf(section);
      assert.ok(index > previousIndex, `${section} must follow the preceding homepage section`);
      previousIndex = index;
    }

    assert.doesNotMatch(pageSource, /CustomersSection/u);
    assert.doesNotMatch(pageSource, /AnnotatedShowcaseSection/u);
    assert.equal(
      pageSource.match(/<FinalCtaSection\s*\/>/gu)?.length,
      1,
      'FinalCtaSection must render exactly once',
    );
  });
});
