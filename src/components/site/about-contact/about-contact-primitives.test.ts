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

  it('renders exactly two wired hero CTA links', () => {
    const source = readComponent('PageScenicHero.tsx');
    const actions = source.match(
      /<div className="about-contact-hero__actions">([\s\S]*?)<\/div>/u,
    )?.[1];

    assert.ok(actions);
    assert.equal(actions.match(/<Link\b/gu)?.length, 2);
    assert.match(actions, /href=\{primaryCta\.href\}/u);
    assert.match(actions, /href=\{secondaryCta\.href\}/u);
  });

  it('keeps compact features concise and structurally semantic', () => {
    const source = readComponent('CompactFeature.tsx');

    assert.match(source, /<article/u);
    assert.match(source, /aria-hidden="true"/u);
    assert.match(source, /<h2/u);
    assert.match(source, /<p/u);
  });

  it('accepts exactly three or four hero features and keeps each desktop set in one row', () => {
    const source = readComponent('PageScenicHero.tsx');
    const featureType = source.match(/type ScenicHeroFeatures =([\s\S]*?);\n\n/u)?.[1];

    assert.ok(featureType);
    const tuples = [...featureType.matchAll(/readonly \[([\s\S]*?)\]/gu)];
    assert.deepEqual(
      tuples.map((tuple) => tuple[1].match(/CompactFeatureProps/gu)?.length),
      [3, 4],
    );
    assert.match(source, /data-feature-count=\{features\.length\}/u);
    assert.match(
      css,
      /about-contact-hero__features\[data-feature-count='3'\][^{]*\{[^}]*repeat\(3,/u,
    );
    assert.match(
      css,
      /about-contact-hero__features\[data-feature-count='4'\][^{]*\{[^}]*repeat\(4,/u,
    );
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

  it('restricts every dynamic CTA to the closed P1.05 public route set', () => {
    const routes = readComponent('publicRoutes.ts');
    const hero = readComponent('PageScenicHero.tsx');
    const conversion = readComponent('PublicConversionBand.tsx');

    for (const route of [
      '/estimate',
      '/contact',
      '/apply',
      '/knowledge-base',
      '/mainland',
      '/free-zones',
      '/offshore',
    ]) {
      assert.match(routes, new RegExp(`'${route}'`, 'u'));
    }
    assert.doesNotMatch(routes, /`\/\$\{string\}`|['"]#|['"]\s*['"]/u);
    assert.match(hero, /href: AboutContactPublicHref/u);
    assert.match(conversion, /href: AboutContactPublicHref/u);
  });

  it('scopes fluid reference geometry, logical properties, themes, focus, and reduced motion', () => {
    assert.match(css, /\.site-public \.about-contact-hero/u);
    assert.match(css, /\.site-public \.about-contact-hero__grid\s*\{[^}]*grid-template-columns:/u);
    assert.match(css, /@media \(min-width: 1280px\)/u);
    assert.match(css, /max-inline-size:\s*1440px/u);
    assert.match(
      css,
      /\.site-public \.about-contact-hero__visual\s*\{[^}]*margin-inline-end:\s*calc\(/u,
    );
    const visualRule = css.match(/\.site-public \.about-contact-hero__visual\s*\{([^}]*)\}/u)?.[1];
    assert.ok(visualRule);
    assert.doesNotMatch(visualRule, /border(?:-radius)?:/u);
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
