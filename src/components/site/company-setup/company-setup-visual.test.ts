import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const css = readFileSync(join(root, 'src/app/(public)/public-theme.css'), 'utf8');

describe('company setup visual contract', () => {
  it('ships five original local WebP assets', () => {
    for (const file of [
      'mainland-hero.webp',
      'free-zone-hero.webp',
      'offshore-hero.webp',
      'emirates-grid.webp',
      'free-zones-grid.webp',
    ]) {
      assert.equal(existsSync(join(root, 'public/company-setup', file)), true, file);
    }
  });

  it('defines scoped desktop reference grids and paired panel geometry', () => {
    assert.match(
      css,
      /\.site-public \.setup-emirate-grid\s*\{[^}]*grid-template-columns:\s*repeat\(7,/u,
    );
    assert.match(
      css,
      /\.site-public \.setup-activity-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/u,
    );
    assert.match(
      css,
      /\.site-public \.setup-popular-grid\s*\{[^}]*grid-template-columns:\s*repeat\(6,/u,
    );
    assert.match(
      css,
      /\.site-public \.setup-paired-panels\s*\{[^}]*grid-template-columns:\s*repeat\(2,/u,
    );
    assert.match(
      css,
      /\.site-public \.setup-operations--three\s*\{[^}]*grid-template-columns:\s*repeat\(3,/u,
    );
  });

  it('contains the directory table and visible keyboard focus without page overflow', () => {
    assert.match(css, /\.site-public \.setup-directory__table-wrap\s*\{[^}]*overflow-x:\s*auto/u);
    assert.match(css, /\.site-public \.setup-filter[^}]*:focus-visible/u);
    assert.match(css, /\.site-public \.setup-faq__item summary:focus-visible/u);
  });

  it('provides dark and reduced-motion treatment without forbidden visual shortcuts', () => {
    assert.match(css, /\.dark \.site-public \.setup-hero__checklist/u);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.setup-card/u);
    const setupCss = css.slice(css.indexOf('P1.04 company setup discovery'));
    assert.doesNotMatch(setupCss, /background-clip:\s*text/u);
  });

  it('locks P1.04 to the authoritative public light and dark palettes', () => {
    assert.match(
      css,
      /\.site-public:has\(\.setup-page\)\s*\{[\s\S]*?--paper:\s*#fff;[\s\S]*?--ink:\s*#000;[\s\S]*?--accent:\s*#ff5722;[\s\S]*?--accent-hover:\s*#e64a19;/u,
    );
    assert.match(
      css,
      /\.dark \.site-public:has\(\.setup-page\)\s*\{[\s\S]*?--paper:\s*#18181b;[\s\S]*?--ink:\s*#fafafa;[\s\S]*?--zinc-950:\s*#f4f4f5;[\s\S]*?--accent:\s*#ff5722;/u,
    );
    assert.match(
      css,
      /\.site-public:has\(\.setup-page\) \.site-public\s*\{[\s\S]*?--paper:\s*inherit;[\s\S]*?--public-cta-background:\s*inherit;/u,
    );
  });

  it('uses only Geist aliases and approved font weights in P1.04 styles', () => {
    const setupCss = css.slice(css.indexOf('P1.04 company setup discovery'));
    assert.match(css, /--font:\s*var\(--font-geist-sans\)/u);
    assert.match(css, /--mono-font:\s*var\(--font-geist-mono\)/u);
    const setupFontFamilies = [...setupCss.matchAll(/font-family:\s*([^;]+);/gu)].map((match) =>
      match[1].trim(),
    );
    assert.equal(
      setupFontFamilies.every((family) => ['var(--font)', 'var(--mono-font)'].includes(family)),
      true,
    );
    assert.doesNotMatch(setupCss, /font-weight:\s*(?:650|[89]00)/u);
  });
});
