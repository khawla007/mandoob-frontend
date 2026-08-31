import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(
  new URL('../../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);

describe('homepage responsive and accessibility contract', () => {
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
  });

  it('provides accessible FAQ targets and focus treatment', () => {
    assert.match(css, /\.home-faq summary\s*\{[\s\S]*?min-block-size:\s*44px/u);
    assert.match(css, /\.home-faq summary:focus-visible\s*\{/u);
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
  });
});
