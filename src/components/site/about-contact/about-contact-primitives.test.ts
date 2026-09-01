import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const componentRoot = join(process.cwd(), 'src/components/site/about-contact');
const readComponent = (file: string) => {
  try {
    return readFileSync(join(componentRoot, file), 'utf8');
  } catch {
    return '';
  }
};
const css = readFileSync(join(process.cwd(), 'src/app/(public)/public-theme.css'), 'utf8');

describe('About and Contact shared primitive contracts', () => {
  it('renders one identified hero heading with semantic breadcrumbs and a priority image', () => {
    const source = readComponent('PageScenicHero.tsx');

    assert.match(source, /<nav[^>]*aria-label="Breadcrumb"/u);
    assert.match(source, /<ol/u);
    assert.equal(source.match(/<h1\b/gu)?.length, 1);
    assert.match(source, /<h1 id=\{headingId\}/u);
    assert.match(source, /import Image from 'next\/image'/u);
    assert.match(source, /fill/u);
    assert.match(source, /sizes="\(min-width: 1280px\) 48vw, \(min-width: 900px\) 46vw, 100vw"/u);
    assert.match(source, /fetchPriority="high"/u);
    assert.match(source, /alt=\{imageAlt\}/u);
    assert.doesNotMatch(source, /['"]use client['"]/u);
    assert.doesNotMatch(source, /href\s*=\s*(?:\{\s*)?['"]\s*(?:#[^'"]*)?['"]/u);
  });

  it('keeps compact features concise and structurally semantic', () => {
    const source = readComponent('CompactFeature.tsx');

    assert.match(source, /<article/u);
    assert.match(source, /aria-hidden="true"/u);
    assert.match(source, /<h2/u);
    assert.match(source, /<p/u);
  });

  it('owns an exactly five-column raised information list with a supplied heading', () => {
    const source = readComponent('RaisedInfoStrip.tsx');

    assert.match(
      source,
      /readonly \[\s*RaisedInfoItem,\s*RaisedInfoItem,\s*RaisedInfoItem,\s*RaisedInfoItem,\s*RaisedInfoItem,?\s*\]/u,
    );
    assert.match(source, /<section[^>]*aria-labelledby=\{headingId\}/u);
    assert.match(source, /headingVisible \? undefined : 'sr-only'/u);
    assert.match(source, /<ul/u);
    assert.match(source, /<li/u);
    assert.match(
      css,
      /\.site-public \.about-contact-info-strip__list\s*\{[^}]*grid-template-columns:\s*repeat\(5,/u,
    );
  });

  it('renders exactly two configurable conversion links with no placeholder targets', () => {
    const source = readComponent('PublicConversionBand.tsx');

    assert.equal(source.match(/<Link\b/gu)?.length, 2);
    assert.match(source, /href=\{primaryCta\.href\}/u);
    assert.match(source, /href=\{secondaryCta\.href\}/u);
    assert.doesNotMatch(source, /href\s*=\s*(?:\{\s*)?['"]\s*(?:#[^'"]*)?['"]/u);
    assert.doesNotMatch(source, /['"]use client['"]/u);
  });

  it('scopes fluid reference geometry, logical properties, themes, focus, and reduced motion', () => {
    assert.match(css, /\.site-public \.about-contact-hero/u);
    assert.match(css, /\.site-public \.about-contact-hero__grid\s*\{[^}]*grid-template-columns:/u);
    assert.match(css, /@media \(min-width: 1280px\)/u);
    assert.match(css, /max-inline-size:\s*1440px/u);
    assert.match(css, /(?:padding|margin|inset|border)-(?:inline|block)/u);
    assert.match(css, /\.dark \.site-public \.about-contact-/u);
    assert.match(css, /var\(--(?:public-|zinc-|ink|paper|accent)/u);
    assert.match(css, /\.site-public \.about-contact-[^{:]+:focus-visible/u);
    assert.match(
      css,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.site-public \.about-contact-/u,
    );
    assert.doesNotMatch(css, /\.site-public \.about-contact-[^{]*\{[^}]*gradient[^;}]*text/u);
  });
});
