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
const publicTheme = readFileSync(join(process.cwd(), 'src/app/(public)/public-theme.css'), 'utf8');
const publicLayout = readFileSync(join(process.cwd(), 'src/app/(public)/layout.tsx'), 'utf8');

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const block = publicTheme.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u'))?.[1];
  assert.ok(block, `missing ${selector} declarations`);
  return block;
}

describe('homepage claims and CTA contract', () => {
  it('keeps the hero estimate button on the shared CTA palette in both themes', () => {
    const hero = componentSources.find(({ file }) => file === 'HeroSection.tsx')?.source ?? '';
    assert.match(hero, /btn btn--accent hero__estimate-cta/u);
    assert.doesNotMatch(publicTheme, /\.site-public \.hero__estimate-cta(?:[:\s,{])/u);
  });

  it('uses the shared eyebrow treatment on major homepage sections', () => {
    for (const file of [
      'ServicesSection.tsx',
      'FlowSection.tsx',
      'EstimatorSection.tsx',
      'WhyMandoobSection.tsx',
      'TestimonialsSection.tsx',
    ]) {
      const source = componentSources.find((component) => component.file === file)?.source ?? '';
      assert.match(source, /eyebrow eyebrow--accent/u, `${file} needs the shared eyebrow style`);
      assert.match(source, /t\('eyebrow'\)/u, `${file} needs localized eyebrow copy`);
    }

    const knowledge =
      componentSources.find(({ file }) => file === 'KnowledgeFaqSection.tsx')?.source ?? '';
    assert.match(knowledge, /knowledge\('eyebrow'\)/u);
    assert.match(knowledge, /faq\('eyebrow'\)/u);
  });

  it('uses the canonical design-4 eyebrow and inline-link treatment', () => {
    assert.match(declarations('.site-public .eyebrow--accent'), /color:\s*var\(--zinc-500\)/u);
    const homeLink = declarations('.site-public .home-text-link');
    assert.match(homeLink, /color:\s*var\(--accent\)/u);
    assert.match(homeLink, /font-size:\s*var\(--fs-13\)/u);
    assert.match(homeLink, /font-weight:\s*600\b/u);
  });

  it('keeps the testimonial heading visible without waiting for a reveal observer', () => {
    const testimonials =
      componentSources.find(({ file }) => file === 'TestimonialsSection.tsx')?.source ?? '';

    assert.match(testimonials, /className="home-testimonials-head"/u);
    assert.doesNotMatch(testimonials, /className="home-testimonials-head reveal"/u);
  });

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

  it('gives only the services heading the SteelNova character blur reveal', () => {
    const services =
      componentSources.find(({ file }) => file === 'ServicesSection.tsx')?.source ?? '';

    assert.match(services, /import type \{ CSSProperties \} from 'react'/u);
    assert.match(services, /const titleText = t\('title'\);/u);
    assert.match(services, /titleText\.trim\(\)\.split\(\/\\s\+\/u\)/u);
    assert.match(services, /let characterIndex = 0;/u);
    assert.match(services, /aria-label=\{titleText\}/u);
    assert.match(services, /home-services-title--blur-reveal reveal/u);
    assert.match(services, /className="home-services-title__visual" aria-hidden="true"/u);
    assert.match(services, /className="home-services-title__word"/u);
    assert.match(services, /Array\.from\(word\)/u);
    assert.match(services, /className="home-services-title__char"/u);
    assert.match(services, /--home-services-char-index/u);
    assert.match(publicTheme, /@keyframes home-services-title-blur-reveal/u);
    assert.match(publicTheme, /opacity:\s*0;[\s\S]*filter:\s*blur\(10px\)/u);
    assert.match(publicTheme, /opacity:\s*1;[\s\S]*filter:\s*blur\(0\)/u);
    assert.match(publicTheme, /1s cubic-bezier\(0\.25, 0\.46, 0\.45, 0\.94\) both/u);
    assert.match(publicTheme, /calc\(var\(--home-services-char-index\) \* 25ms\)/u);
    assert.match(publicTheme, /home-services-title__char[\s\S]*animation:\s*none/u);
    assert.match(
      publicLayout,
      /home-services-title__char\{opacity:1!important;filter:none!important;animation:none!important;\}/u,
    );
    assert.match(services, /home-setup-grid cards-stagger/u);
    assert.doesNotMatch(services, /home-setup-card--(?:left|center|right)/u);
  });

  it('preserves carousel density with factual workflow capabilities instead of fabricated proof', () => {
    const testimonials =
      componentSources.find(({ file }) => file === 'TestimonialsSection.tsx')?.source ?? '';
    const carousel =
      componentSources.find(({ file }) => file === 'TestimonialsCarousel.tsx')?.source ?? '';

    assert.match(testimonials, /TestimonialsCarousel/u);
    assert.equal(testimonials.match(/key: 'item(?:10|[1-9])'/gu)?.length, 10);
    assert.match(testimonials, /t\('carouselLabel'\)/u);
    assert.doesNotMatch(testimonials, /CLIENTS|client\d+(?:Name|Role|Quote)|fiveStars/u);
    assert.match(testimonials, /previousLabel/u);
    assert.match(testimonials, /nextLabel/u);
    assert.match(testimonials, /positionLabel/u);
    assert.match(carousel, /from 'swiper\/react'/u);
    assert.doesNotMatch(carousel, /Autoplay|autoplay=|delay:\s*0/u);
    assert.match(carousel, /type="button"/u);
    assert.match(carousel, /aria-label=\{previousLabel\}/u);
    assert.match(carousel, /aria-label=\{nextLabel\}/u);
    assert.match(carousel, /aria-live="polite"/u);
    assert.match(carousel, /slidePrev\(\)/u);
    assert.match(carousel, /slideNext\(\)/u);
    assert.match(carousel, /speed=\{reducedMotion \? 0 : 350\}/u);
    assert.match(carousel, /rewind=\{items\.length > 4\}/u);
    assert.doesNotMatch(carousel, /blockquote|ratingLabel|★/u);
    assert.match(carousel, /450:\s*\{ slidesPerView: 1, spaceBetween: 10 \}/u);
    assert.match(carousel, /640:\s*\{ slidesPerView: 2, spaceBetween: 15 \}/u);
    assert.match(carousel, /768:\s*\{ slidesPerView: 3, spaceBetween: 15 \}/u);
    assert.match(carousel, /1024:\s*\{ slidesPerView: 4, spaceBetween: 20 \}/u);
    assert.doesNotMatch(carousel, /onPointerDown|onTransitionEnd|CLONE_COUNT/u);
    assert.match(carousel, /home-testimonials-controls/u);
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
