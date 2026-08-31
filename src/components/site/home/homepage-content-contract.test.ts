import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const homeDirectory = join(process.cwd(), 'src/components/site/home');
const componentSources = [
  'HeroSection.tsx',
  'TrustBandSection.tsx',
  'ServicesSection.tsx',
  'EstimatorSection.tsx',
  'FlowSection.tsx',
  'WhyMandoobSection.tsx',
  'AnnotatedShowcaseSection.tsx',
  'KnowledgeFaqSection.tsx',
  'FinalCtaSection.tsx',
].map((file) => ({ file, source: readFileSync(join(homeDirectory, file), 'utf8') }));
const allSource = componentSources.map(({ source }) => source).join('\n');

describe('homepage claims and CTA contract', () => {
  it('rejects the unsupported proof, timing, savings, and remote fixture content from PF1-AUDIT-006', () => {
    for (const unsupported of [
      /320\+/u,
      /1,200\+/u,
      /98%/u,
      /AED 2\.4M/u,
      /AED 2,400/u,
      /7\s*(?:to|–|-)\s*14 days/iu,
      /compared live/iu,
      /zero (?:upsells|fines|variance|surprises)/iu,
      /dicebear\.com/iu,
      /popsy\.co/iu,
      /Jonas Keller|Priya Ramesh|Omar Bensalem|Lina Chen/iu,
    ]) {
      assert.doesNotMatch(allSource, unsupported);
    }
  });

  it('uses real routes for action-looking controls', () => {
    assert.doesNotMatch(allSource, /href=["'{]#(?:["'}])/u);
    assert.doesNotMatch(
      allSource,
      /<span[^>]+className=["'][^"']*(?:btn|cell__link|annotated-mock__cta)[^"']*["']/u,
    );
  });

  it('labels every synthetic preview as illustrative', () => {
    for (const { file, source } of componentSources) {
      if (/EstimatorPreview|annotated-mock/iu.test(source)) {
        assert.match(source, /illustrative/iu, `${file} must visibly qualify synthetic content`);
      }
    }
  });
});
