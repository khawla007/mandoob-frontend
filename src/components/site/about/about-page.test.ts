import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const readSource = (path: string) => {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    return '';
  }
};

const body = readSource('src/components/site/about/AboutPageBody.tsx');
const route = readSource('src/app/(public)/about/page.tsx');
const css = readSource('src/app/(public)/public-theme.css');
const aboutCss = css.slice(
  css.indexOf('/* ---------- About page P1.05 ---------- */'),
  css.indexOf('/* ---------- P1.03 reference-led homepage body ---------- */'),
);

const countItems = (name: string) => {
  const block = body.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`, 'u'))?.[1];
  assert.ok(block, `${name} must be a static tuple`);
  return block.match(/\btitle:\s*'/gu)?.length ?? 0;
};

describe('strict-parity About page', () => {
  it('keeps the exact seven-part source order and delegates the route body', () => {
    const orderedParts = [
      '<PageScenicHero',
      '<RaisedInfoStrip',
      '<section className="about-page__who"',
      '<section className="about-page__values"',
      '<section className="about-page__process"',
      '<section className="about-page__team"',
      '<PublicConversionBand',
    ];

    let previous = -1;
    for (const part of orderedParts) {
      const index = body.indexOf(part);
      assert.ok(index > previous, `${part} must follow the preceding About region`);
      previous = index;
    }

    assert.equal(body.match(/<PageScenicHero\b/gu)?.length, 1);
    assert.equal(body.match(/<RaisedInfoStrip\b/gu)?.length, 1);
    assert.equal(body.match(/<PublicConversionBand\b/gu)?.length, 1);
    assert.match(route, /import \{ AboutPageBody \}/u);
    assert.match(route, /return <AboutPageBody\s*\/>;/u);
  });

  it('locks the five, four, five, and four content collections', () => {
    assert.equal(countItems('capabilityItems'), 5);
    assert.equal(countItems('values'), 4);
    assert.equal(countItems('processSteps'), 5);
    assert.equal(countItems('teamFunctions'), 4);
  });

  it('uses the two approved local images with responsive sizing and descriptive alternatives', () => {
    assert.match(body, /import Image from 'next\/image';/u);
    assert.match(body, /imageSrc="\/hero\/skyline\.webp"/u);
    assert.match(body, /imageAlt="Dubai skyline beside the waterfront"/u);
    assert.match(body, /src="\/hero\/pro-firm-operations\.webp"/u);
    assert.match(body, /sizes="\(min-width: 1280px\) 34vw, \(min-width: 900px\) 38vw, 100vw"/u);
    assert.match(body, /alt="Business team reviewing company setup work together around a table"/u);
    assert.doesNotMatch(body, /https?:\/\/[^'"\s)]+\.(?:png|jpe?g|webp|avif)/iu);
  });

  it('uses safe one-company and one-PRO language with real conversion routes', () => {
    for (const label of [
      'One company workspace',
      'One assigned PRO',
      'Guided setup stages',
      'Controlled document review',
      'Auditable activity history',
    ]) {
      assert.match(body, new RegExp(label, 'u'));
    }

    assert.match(body, /one workspace for each company/iu);
    assert.match(body, /one assigned PRO/iu);
    assert.match(body, /primaryCta=\{\{ label: '[^']+', href: '\/estimate' \}\}/u);
    assert.match(body, /secondaryCta=\{\{ label: '[^']+', href: '\/contact' \}\}/u);
    assert.doesNotMatch(body, /href\s*=\s*(?:\{\s*)?['"]\s*(?:#[^'"]*)?['"]/u);
  });

  it('publishes only transparent team functions with icons and no invented people', () => {
    for (const label of [
      'Product',
      'UAE Operations',
      'Customer Support',
      'Compliance Coordination',
    ]) {
      assert.match(body, new RegExp(`title: '${label}'`, 'u'));
    }

    assert.match(body, /about-page__team-icon[^>]*aria-hidden="true"/u);
    assert.doesNotMatch(body, /<Image[^>]+about-page__team/iu);
    assert.doesNotMatch(body, /LinkedIn|\bCEO\b|\bfounder\b|\bhead of\b|\byears?\b/iu);
  });

  it('keeps semantic sections, headings, lists, and single-h1 ownership', () => {
    assert.equal(body.match(/<h1\b/gu)?.length ?? 0, 0);
    assert.equal(route.match(/<h1\b/gu)?.length ?? 0, 0);
    assert.match(body, /<PageScenicHero[\s\S]*headingId="about-page-title"/u);
    assert.equal(body.match(/<section\b/gu)?.length, 4);
    assert.ok((body.match(/<h2\b/gu)?.length ?? 0) >= 4);
    assert.ok((body.match(/<ul\b/gu)?.length ?? 0) >= 2);
    assert.match(body, /<ol className="about-page__process-list">/u);
    assert.match(body, /aria-labelledby="about-(?:story|values|process|team)-title"/u);
  });

  it('contains no unsupported proof, money, timing, guarantee, or endorsement claims', () => {
    const banned = [
      /\b\d+(?:[,.]\d+)?\s*(?:%|\+|businesses|clients|customers|companies|years?)\b/iu,
      /\b(?:save|saving|savings|discount|fine|fines|penalty|penalties)\b/iu,
      /\b(?:instant|same[ -]day|within\s+\d+|timeline|turnaround)\b/iu,
      /\b(?:zero fees?|no hidden fees?|guarantee(?:d|s)?)\b/iu,
      /\b(?:testimonial|rating|award|certif(?:ied|ication)|official partner|authority partner)\b/iu,
    ];
    for (const claim of banned) assert.doesNotMatch(body, claim);
  });

  it('defines scoped desktop geometry, mission overlap, icon circles, process connectors, and team panels', () => {
    const taskCss = aboutCss;
    assert.ok(taskCss.length > 100);
    assert.match(taskCss, /\.site-public \.about-page__/u);
    assert.match(taskCss, /@media \(min-width: 1280px\)/u);
    assert.match(taskCss, /max-inline-size:\s*1440px/u);
    assert.match(taskCss, /about-page__who-grid\s*\{[^}]*grid-template-columns:/u);
    assert.match(taskCss, /about-page__purpose\s*\{[^}]*margin-inline-start:\s*-/u);
    assert.match(
      taskCss,
      /about-page__(?:value|process-icon|team-icon)[^{]*\{[^}]*border-radius:\s*var\(--r-pill\)/u,
    );
    assert.match(taskCss, /about-page__process-item:not\(:last-child\)::after/u);
    assert.match(taskCss, /about-page__team-list\s*\{[^}]*grid-template-columns:\s*repeat\(4,/u);
    assert.match(taskCss, /\.dark \.site-public \.about-page__/u);
    assert.match(taskCss, /(?:padding|margin|inset|border)-(?:inline|block)/u);
    assert.doesNotMatch(
      taskCss,
      /\b(?:margin-left|margin-right|padding-left|padding-right|left|right):/u,
    );
  });

  it('stacks only at the existing narrower breakpoint and removes desktop connectors there', () => {
    const taskCss = aboutCss;
    const narrow = taskCss.match(
      /@media \(max-width: 899px\) \{([\s\S]*?)@media \(max-width: 639px\)/u,
    )?.[1];
    assert.ok(narrow);
    assert.match(narrow, /about-page__who-grid[^{]*\{[^}]*grid-template-columns:\s*1fr/u);
    assert.match(narrow, /about-page__values-list[^{]*\{[^}]*grid-template-columns:\s*repeat\(2,/u);
    assert.match(narrow, /about-page__process-list[^{]*\{[^}]*grid-template-columns:\s*1fr/u);
    assert.match(narrow, /about-page__team-list[^{]*\{[^}]*grid-template-columns:\s*repeat\(2,/u);
    assert.match(
      narrow,
      /about-page__process-item:not\(:last-child\)::after[^{]*\{[^}]*display:\s*none/u,
    );
  });
});
