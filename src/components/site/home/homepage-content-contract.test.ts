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
  'SupportServicesSection.tsx',
  'TestimonialsSection.tsx',
  'TestimonialsCarousel.tsx',
  'KnowledgeFaqSection.tsx',
  'FinalCtaSection.tsx',
].map((file) => ({ file, source: readFileSync(join(homeDirectory, file), 'utf8') }));
const allSource = componentSources.map(({ source }) => source).join('\n');

describe('homepage claims and CTA contract', () => {
  it('uses the compact reference-led setup, journey and estimator structures', () => {
    const services =
      componentSources.find(({ file }) => file === 'ServicesSection.tsx')?.source ?? '';
    const flow = componentSources.find(({ file }) => file === 'FlowSection.tsx')?.source ?? '';
    const estimator =
      componentSources.find(({ file }) => file === 'EstimatorSection.tsx')?.source ?? '';
    const hero = componentSources.find(({ file }) => file === 'HeroSection.tsx')?.source ?? '';

    assert.doesNotMatch(services, /compare__table|home-support-grid/u);
    assert.match(services, /home-setup-grid/u);
    assert.match(flow, /home-flow-row/u);
    assert.match(estimator, /home-estimator-band/u);
    assert.match(estimator, /home-estimate-card/u);
    assert.doesNotMatch(estimator, /EstimatorPreview/u);
    assert.doesNotMatch(hero, /stats-band|hero__spec/u);
  });

  it('renders ten localized testimonials through an accessible carousel', () => {
    const testimonials =
      componentSources.find(({ file }) => file === 'TestimonialsSection.tsx')?.source ?? '';
    const carousel =
      componentSources.find(({ file }) => file === 'TestimonialsCarousel.tsx')?.source ?? '';

    assert.match(testimonials, /TestimonialsCarousel/u);
    assert.equal(testimonials.match(/key: 'client(?:10|[1-9])'/gu)?.length, 10);
    assert.match(testimonials, /t\('carouselLabel'\)/u);
    assert.match(testimonials, /t\('fiveStars'\)/u);
    assert.doesNotMatch(testimonials, /previousLabel|nextLabel|positionLabels/u);
    assert.match(carousel, /from 'swiper\/react'/u);
    assert.match(carousel, /from 'swiper\/modules'/u);
    assert.match(carousel, /modules=\{\[Autoplay\]\}/u);
    assert.match(carousel, /delay:\s*0/u);
    assert.match(carousel, /disableOnInteraction:\s*true/u);
    assert.match(carousel, /pauseOnMouseEnter:\s*true/u);
    assert.match(carousel, /speed=\{reducedMotion \? 0 : 8000\}/u);
    assert.match(carousel, /loop=\{testimonials\.length > 4\}/u);
    assert.match(carousel, /450:\s*\{ slidesPerView: 1, spaceBetween: 10 \}/u);
    assert.match(carousel, /640:\s*\{ slidesPerView: 2, spaceBetween: 15 \}/u);
    assert.match(carousel, /768:\s*\{ slidesPerView: 3, spaceBetween: 15 \}/u);
    assert.match(carousel, /1024:\s*\{ slidesPerView: 4, spaceBetween: 20 \}/u);
    assert.doesNotMatch(carousel, /onPointerDown|onTransitionEnd|CLONE_COUNT/u);
    assert.doesNotMatch(carousel, /home-testimonials-arrow/u);
  });

  it('uses explicit catalog suffixes for setup-card facts', () => {
    const services =
      componentSources.find(({ file }) => file === 'ServicesSection.tsx')?.source ?? '';
    assert.doesNotMatch(services, /row\[0\]\.toUpperCase/u);
    assert.match(services, /\$\{key\}Ideal/u);
    assert.match(services, /\$\{key\}Market/u);
    assert.match(services, /\$\{key\}Office/u);
  });

  it('keeps the accepted public-shell customers anchor resolvable', () => {
    const knowledge =
      componentSources.find(({ file }) => file === 'KnowledgeFaqSection.tsx')?.source ?? '';
    assert.match(knowledge, /<section id="customers"/u);
  });

  it('renders four image-led knowledge cards with real local routes', () => {
    const knowledge =
      componentSources.find(({ file }) => file === 'KnowledgeFaqSection.tsx')?.source ?? '';
    assert.match(knowledge, /from 'next\/image'/u);
    assert.equal(knowledge.match(/<article className="home-knowledge-card/u)?.length, 1);
    assert.equal(knowledge.match(/key: 'card[1-4]'/gu)?.length, 4);
    assert.match(knowledge, /ARTICLES\.map/u);
    assert.match(knowledge, /'\/knowledge-base'/u);
    assert.match(knowledge, /'\/blog'/u);
    for (const referenceImage of [
      'business-setup-hd.png',
      'free-zone-hd.png',
      'pro-services-hd.png',
      'vat-registration-hd.png',
    ]) {
      assert.match(
        knowledge,
        new RegExp(`/home-reference/${referenceImage.replace('.', '\\.')}`, 'u'),
      );
    }
  });

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
