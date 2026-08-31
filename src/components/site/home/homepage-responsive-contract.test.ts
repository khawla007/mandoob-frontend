import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(
  new URL('../../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);

describe('homepage responsive and accessibility contract', () => {
  it('bounds the annotated preview and delays floating callouts until wide desktop', () => {
    assert.match(css, /\.site-public \.annotated-showcase\s*\{[\s\S]*?overflow:\s*clip/u);
    assert.match(css, /@media \(min-width:\s*1200px\)[^{]*\{[\s\S]*?\.annotated-chip/u);
    assert.match(css, /\.site-public \.annotated-mock\s*\{[\s\S]*?min-width:\s*0/u);
  });

  it('provides accessible FAQ targets and focus treatment', () => {
    assert.match(css, /\.home-faq summary\s*\{[\s\S]*?min-block-size:\s*44px/u);
    assert.match(css, /\.home-faq summary:focus-visible\s*\{/u);
  });
});
