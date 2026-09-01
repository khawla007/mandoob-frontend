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

const body = readSource('src/components/site/contact/ContactPageBody.tsx');
const route = readSource('src/app/(public)/contact/page.tsx');
const scenicHero = readSource('src/components/site/about-contact/PageScenicHero.tsx');
const css = readSource('src/app/(public)/public-theme.css');
const contactCss = css.slice(
  css.indexOf('/* ---------- Contact page P1.05 ---------- */'),
  css.indexOf('/* ---------- P1.03 reference-led homepage body ---------- */'),
);

const arrayBlock = (name: string) => {
  const block = body.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`, 'u'))?.[1];
  assert.ok(block, `${name} must be a static tuple`);
  return block;
};

describe('strict-parity Contact page', () => {
  it('keeps the exact five-part source order and delegates the server route body', () => {
    const orderedParts = [
      '<PageScenicHero',
      '<RaisedInfoStrip',
      '<section className="contact-page__workspace"',
      '<section className="contact-page__support-row"',
      '<PublicConversionBand',
    ];

    let previous = -1;
    for (const part of orderedParts) {
      const index = body.indexOf(part);
      assert.ok(index > previous, `${part} must follow the preceding Contact region`);
      previous = index;
    }

    assert.equal(body.match(/<PageScenicHero\b/gu)?.length, 1);
    assert.equal(body.match(/<RaisedInfoStrip\b/gu)?.length, 1);
    assert.equal(body.match(/<ContactForm\s*\/>/gu)?.length, 1);
    assert.equal(body.match(/<PublicConversionBand\b/gu)?.length, 1);
    assert.match(route, /import \{ ContactPageBody \}/u);
    assert.match(route, /<ContactPageBody[\s\S]*heroCopy=/u);
    assert.doesNotMatch(`${route}\n${body}`, /['"]use client['"]/u);
  });

  it('renders one scenic hero with four compact capabilities and local UAE imagery', () => {
    assert.match(body, /className="contact-page__hero"/u);
    assert.match(body, /headingId="contact-page-title"/u);
    assert.match(body, /imageSrc="\/hero\/skyline\.webp"/u);
    assert.match(body, /imageAlt="Dubai skyline at sunset"/u);
    assert.match(scenicHero, /preload=\{true\}/u);

    const features = body.match(/features=\{\[([\s\S]*?)\]\}/u)?.[1] ?? '';
    assert.equal(features.match(/\btitle:\s*'/gu)?.length, 4);
    assert.equal(body.match(/<h1\b/gu)?.length ?? 0, 0);
    assert.equal(route.match(/<h1\b/gu)?.length ?? 0, 0);
  });

  it('locks five unavailable channel slots in the approved order without destinations', () => {
    const channels = arrayBlock('contactChannels');
    const orderedTitles = ['Office location', 'Phone', 'Email', 'WhatsApp', 'Hours'];
    let previous = -1;
    for (const title of orderedTitles) {
      const index = channels.indexOf(`title: '${title}'`);
      assert.ok(index > previous, `${title} must follow the previous contact channel`);
      previous = index;
    }

    assert.equal(channels.match(/status:\s*'Unavailable'/gu)?.length, 5);
    assert.equal(channels.match(/\btitle:\s*'/gu)?.length, 5);
    assert.doesNotMatch(channels, /href:|mailto:|tel:|https?:\/\//iu);
    assert.doesNotMatch(channels, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu);
    assert.doesNotMatch(channels, /\+971|\b0\d{1,2}[\s()-]*\d{3}/u);
  });

  it('pairs the real form with supported help categories and qualified banking language', () => {
    const categories = arrayBlock('helpCategories');
    for (const label of [
      'Company setup',
      'Cost estimate',
      'Document requirements',
      'Visa and immigration guidance',
      'Banking requirements guidance',
      'Licence renewal',
    ]) {
      assert.match(categories, new RegExp(`title: '${label}'`, 'u'));
    }
    assert.match(categories, /bank[^']*(?:subject to|depend|not guaranteed)/iu);
    assert.match(body, /<ContactForm\s*\/>/u);
    assert.match(body, /aria-labelledby="contact-help-title"/u);
  });

  it('keeps WhatsApp unavailable and limits Quick Links to working safe routes', () => {
    assert.match(body, /contact-page__whatsapp[\s\S]*?Unavailable/u);
    assert.doesNotMatch(
      body.match(/<article className="contact-page__whatsapp"([\s\S]*?)<\/article>/u)?.[1] ?? '',
      /<Link|href=|https?:\/\//u,
    );

    const quickLinks = arrayBlock('quickLinks');
    const routes = [...quickLinks.matchAll(/href:\s*'([^']+)'/gu)].map((match) => match[1]);
    assert.deepEqual(routes, [
      '/estimate',
      '/mainland',
      '/free-zones',
      '/offshore',
      '/knowledge-base',
      '/apply',
    ]);
    assert.doesNotMatch(quickLinks, /href:\s*'(?:#|\/contact|\/login|\/register)/u);
  });

  it('ends with a compact non-self conversion band and no unsupported claims', () => {
    const conversionIndex = body.lastIndexOf('<PublicConversionBand');
    assert.ok(conversionIndex > body.lastIndexOf('<section'));
    assert.match(body.slice(conversionIndex), /primaryCta=\{\{[^}]*href: '\/estimate' \}\}/u);
    assert.match(
      body.slice(conversionIndex),
      /secondaryCta=\{\{ label: '[^']*(?:help|guidance)[^']*', href: '\/knowledge-base' \}\}/iu,
    );
    assert.doesNotMatch(
      body,
      /\b(?:instant|same[ -]day|response time|guarantee(?:d|s)?|fine|fines|penalt(?:y|ies))\b/iu,
    );
    assert.doesNotMatch(body, /\b\d+(?:[,.]\d+)?\s*(?:%|\+|minutes?|hours?|days?)\b/iu);
  });

  it('defines scoped, logical, reference-dense desktop geometry with no overflow trigger', () => {
    assert.ok(contactCss.length > 100);
    assert.match(contactCss, /\.site-public \.contact-page__/u);
    assert.match(contactCss, /contact-page__workspace-grid\s*\{[^}]*grid-template-columns:/u);
    assert.match(contactCss, /contact-page__support-grid\s*\{[^}]*grid-template-columns:/u);
    assert.match(
      contactCss,
      /contact-page__hero[\s\S]*?about-contact-hero__visual\s*\{[^}]*min-block-size:\s*4\d{2}px/u,
    );
    assert.match(
      contactCss,
      /contact-page__workspace,[\s\S]*?padding-block:\s*clamp\([^,]+,[^,]+,\s*\d{2}px\)/u,
    );
    assert.match(contactCss, /\.dark \.site-public \.contact-page__/u);
    assert.match(contactCss, /(?:padding|margin|inset|border)-(?:inline|block)/u);
    assert.doesNotMatch(
      contactCss,
      /\b(?:margin-left|margin-right|padding-left|padding-right|left|right):/u,
    );
    assert.doesNotMatch(contactCss, /(?:inline-size|width):\s*100vw/u);
  });
});
