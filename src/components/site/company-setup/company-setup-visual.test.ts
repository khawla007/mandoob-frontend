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
    assert.match(css, /\.site-public \.setup-emirate-grid\s*\{[^}]*grid-template-columns:\s*repeat\(7,/su);
    assert.match(css, /\.site-public \.setup-activity-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/su);
    assert.match(css, /\.site-public \.setup-popular-grid\s*\{[^}]*grid-template-columns:\s*repeat\(6,/su);
    assert.match(css, /\.site-public \.setup-paired-panels\s*\{[^}]*grid-template-columns:\s*repeat\(2,/su);
    assert.match(css, /\.site-public \.setup-operations--three\s*\{[^}]*grid-template-columns:\s*repeat\(3,/su);
  });

  it('contains the directory table and visible keyboard focus without page overflow', () => {
    assert.match(css, /\.site-public \.setup-directory__table-wrap\s*\{[^}]*overflow-x:\s*auto/su);
    assert.match(css, /\.site-public \.setup-filter[^}]*:focus-visible/su);
    assert.match(css, /\.site-public \.setup-faq__item summary:focus-visible/su);
  });

  it('provides dark and reduced-motion treatment without forbidden visual shortcuts', () => {
    assert.match(css, /\.dark \.site-public \.setup-hero__checklist/su);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.setup-card/su);
    const setupCss = css.slice(css.indexOf('P1.04 company setup discovery'));
    assert.doesNotMatch(setupCss, /background-clip:\s*text|#[fF]{6}|#000(?:000)?/u);
  });
});
