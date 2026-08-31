import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(
  new URL('../../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);

function readOptionalFile(url: URL) {
  try {
    return readFileSync(url, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function extractCssBlocks(source: string, atRule: RegExp) {
  const blocks: string[] = [];
  const globalAtRule = new RegExp(atRule.source, `${atRule.flags.replace('g', '')}g`);

  for (const match of source.matchAll(globalAtRule)) {
    const start = match.index ?? 0;
    const openingBrace = source.indexOf('{', start);
    if (openingBrace < 0) continue;

    let depth = 0;
    for (let index = openingBrace; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      if (depth === 0) {
        blocks.push(source.slice(start, index + 1));
        break;
      }
    }
  }

  return blocks;
}

const faqAccordion = readOptionalFile(new URL('./FaqAccordion.tsx', import.meta.url));
const knowledgeFaqSection = readOptionalFile(
  new URL('./KnowledgeFaqSection.tsx', import.meta.url),
);
const reducedMotionCssBlocks = extractCssBlocks(
  css,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)/u,
);

describe('homepage responsive and accessibility contract', () => {
  it('uses the approved wide public container', () => {
    assert.match(css, /--container:\s*1440px;/u);
  });

  it('defines the compact desktop reference grids', () => {
    assert.match(
      css,
      /\.site-public \.home-setup-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/u,
    );
    assert.match(
      css,
      /\.site-public \.home-services-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,/u,
    );
    assert.match(
      css,
      /\.site-public \.home-knowledge-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/u,
    );
    assert.match(
      css,
      /\.site-public \.home-testimonials-carousel \.swiper-wrapper\s*\{[\s\S]*?align-items:\s*stretch/u,
    );
  });

  it('provides accessible FAQ targets and focus treatment', () => {
    assert.match(css, /\.home-faq summary\s*\{[\s\S]*?min-block-size:\s*44px/u);
    assert.match(css, /\.home-faq summary:focus-visible\s*\{/u);
  });

  it('uses a smooth single-open FAQ accordion', () => {
    assert.match(faqAccordion, /'use client';/u);
    assert.match(faqAccordion, /useState<number \| null>\(null\)/u);
    assert.match(
      faqAccordion,
      /setOpenIndex\(\(current\) => \(current === index \? null : index\)\)/u,
    );
    assert.match(faqAccordion, /aria-expanded=\{isOpen\}/u);
    assert.match(faqAccordion, /aria-controls=\{answerId\}/u);
    assert.match(knowledgeFaqSection, /<FaqAccordion items=\{faqItems\} \/>/u);
    assert.doesNotMatch(knowledgeFaqSection, /<details/u);
    assert.match(
      css,
      /\.home-faq__answer\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*transition:/u,
    );
    assert.match(
      css,
      /\.home-faq__item\[data-open\]\s+\.home-faq__answer\s*\{[^}]*grid-template-rows:\s*1fr/u,
    );
    const faqReducedMotionCss = reducedMotionCssBlocks.find((block) =>
      block.includes('.home-faq__answer'),
    );
    assert.match(
      faqReducedMotionCss ?? '',
      /\.home-faq__answer\s*\{[^}]*transition:\s*none/u,
    );
  });

  it('uses high-contrast text tokens inside tinted and dark homepage bands', () => {
    assert.match(css, /\.site-public \.home-flow-row__number\s*\{[^}]*color:\s*var\(--ink\)/u);
    assert.match(
      css,
      /\.site-public #estimator \.home-estimator-band__copy \.home-estimator-kicker\s*\{[^}]*color:\s*var\(--ink-inv\)/u,
    );
    assert.match(
      css,
      /\.site-public \.home-testimonial-card__head p\s*\{[^}]*color:\s*var\(--zinc-600\)/u,
    );
  });

  it('collapses dense bands without horizontal page overflow', () => {
    assert.match(
      css,
      /@media \(max-width:\s*767px\)[\s\S]*?\.site-public \.home-faq__grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/u,
    );
    assert.match(
      css,
      /@media \(max-width:\s*767px\)[\s\S]*?\.site-public \.home-estimator-band\s*\{[\s\S]*?grid-template-columns:\s*1fr/u,
    );
    assert.match(css, /\.site-public \.home-testimonials-carousel\s*\{[^}]*overflow:\s*hidden/u);
    assert.doesNotMatch(css, /home-testimonials-arrow/u);
  });
});
