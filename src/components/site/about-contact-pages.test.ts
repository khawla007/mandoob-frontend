import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const aboutSource = readFileSync(
  new URL('../../app/(public)/about/page.tsx', import.meta.url),
  'utf8',
);
const aboutBodySource = readFileSync(new URL('./about/AboutPageBody.tsx', import.meta.url), 'utf8');
const scenicHeroSource = readFileSync(
  new URL('./about-contact/PageScenicHero.tsx', import.meta.url),
  'utf8',
);
const contactSource = readFileSync(
  new URL('../../app/(public)/contact/page.tsx', import.meta.url),
  'utf8',
);
const contactBodySource = readFileSync(
  new URL('./contact/ContactPageBody.tsx', import.meta.url),
  'utf8',
);
const publicLayoutSource = readFileSync(
  new URL('../../app/(public)/layout.tsx', import.meta.url),
  'utf8',
);

const samplePhonePattern = /(?:\+971[\s()-]*\d{1,2}|\b0\d{1,2})[\s()-]*\d{3}[\s-]*\d{4}\b/u;
const sampleAddressPattern =
  /(?:\b(?:building|office|suite|floor)\s+(?:no\.?\s*)?\d|\b\d+[a-z]?\s+(?:street|road|avenue)\b)/iu;

describe('About composition and Contact route shell', () => {
  it('recognizes common UAE sample phone formats as unsupported contact fixtures', () => {
    for (const phone of ['+971 50 123 4567', '+971 4 123 4567', '050 123 4567', '04 123 4567']) {
      assert.match(phone, samplePhonePattern);
    }
  });

  it('/about delegates to its server body and owns one composed h1 with static metadata', () => {
    assert.match(aboutSource, /import \{ AboutPageBody \}/u);
    assert.match(aboutSource, /return <AboutPageBody\s*\/>;/u);
    assert.match(aboutBodySource, /<PageScenicHero/u);
    assert.equal(
      [aboutSource, aboutBodySource, scenicHeroSource]
        .map((source) => source.match(/<h1\b/gu)?.length ?? 0)
        .reduce((total, count) => total + count, 0),
      1,
    );
    assert.match(aboutSource, /import type \{ Metadata \} from 'next';/u);
    assert.match(aboutSource, /export const metadata: Metadata\s*=\s*\{/u);
    assert.match(aboutSource, /alternates:\s*\{\s*canonical:\s*'https:\/\/mandoob\.ae\/about'/u);
    assert.doesNotMatch(`${aboutSource}\n${aboutBodySource}`, /['"]use client['"]/u);
    assert.doesNotMatch(aboutSource, /generateMetadata/u);
  });

  it('/contact delegates to its server body and owns one composed h1 with static metadata', () => {
    assert.match(contactSource, /import \{ ContactPageBody \}/u);
    assert.match(contactSource, /<ContactPageBody[\s\S]*heroCopy=/u);
    assert.match(contactBodySource, /<PageScenicHero/u);
    assert.equal(
      [contactSource, contactBodySource, scenicHeroSource]
        .map((source) => source.match(/<h1\b/gu)?.length ?? 0)
        .reduce((total, count) => total + count, 0),
      1,
    );
    assert.match(contactSource, /import type \{ Metadata \} from 'next';/u);
    assert.match(contactSource, /export const metadata: Metadata\s*=\s*\{/u);
    assert.match(
      contactSource,
      /alternates:\s*\{\s*canonical:\s*'https:\/\/mandoob\.ae\/contact'/u,
    );
    assert.doesNotMatch(`${contactSource}\n${contactBodySource}`, /['"]use client['"]/u);
    assert.doesNotMatch(contactSource, /generateMetadata/u);
  });

  it('preserves claim-safe English and Arabic catalog usage in the server route', () => {
    assert.match(contactSource, /import \{ getTranslations \} from 'next-intl\/server';/u);
    assert.match(
      contactSource,
      /export default async function ContactPage\(\{ searchParams \}: ContactPageProps\)/u,
    );
    assert.match(contactSource, /process\.env\.NODE_ENV === 'development'/u);
    assert.match(contactSource, /await getTranslations\('contact'\)/u);
    assert.match(contactSource, /await getTranslations\('site'\)/u);
    assert.match(contactSource, /eyebrow:\s*tContact\('eyebrow'\)/u);
    assert.match(contactSource, /title:\s*tContact\('title'\)/u);
    assert.match(contactSource, /description:\s*tSite\('footer\.description'\)/u);
    assert.doesNotMatch(contactSource, /estimateLabel|tSite\('getEstimate'\)/u);
    assert.doesNotMatch(
      contactSource,
      /tContact\('(?:lede|comingSoonNote|officeCity|officeCountry|officeHours)'\)/u,
    );
    assert.doesNotMatch(contactSource, /generateMetadata/u);
  });

  it('uses only real in-scope conversion routes', () => {
    assert.match(aboutBodySource, /href:\s*['"]\/estimate['"]/u);
    assert.match(aboutBodySource, /href:\s*['"]\/contact['"]/u);
    assert.match(contactBodySource, /href:\s*['"]\/estimate['"]/u);
    for (const source of [aboutBodySource, contactBodySource]) {
      const heroStart = source.indexOf('<PageScenicHero');
      const heroEnd = source.indexOf('<RaisedInfoStrip');
      assert.ok(heroStart > 0);
      assert.ok(heroEnd > heroStart);
      assert.doesNotMatch(source.slice(heroStart, heroEnd), /primaryCta|secondaryCta/u);
    }

    for (const [path, source] of [
      ['/about', `${aboutSource}\n${aboutBodySource}`],
      ['/contact', `${contactSource}\n${contactBodySource}`],
    ] as const) {
      assert.doesNotMatch(source, /href\s*=\s*(?:\{\s*)?["']\s*(?:#(?:[^"']*)?)?["']/u, path);
    }
  });

  it('leaves the accepted public shell owned by the shared layout', () => {
    assert.match(publicLayoutSource, /<SiteHeader\s*\/>/u);
    assert.match(publicLayoutSource, /<main id="main"/u);
    assert.match(publicLayoutSource, /<SiteFooter\s*\/>/u);

    for (const [path, source] of [
      ['/about', aboutSource],
      ['/contact', contactSource],
    ] as const) {
      assert.doesNotMatch(source, /SiteHeader|SiteFooter|<main\b/u, path);
    }
  });

  it('publishes no unsupported proof, timing, fine, guarantee, or sample contact claims', () => {
    const allRouteSource = [aboutSource, aboutBodySource, contactSource, contactBodySource].join(
      '\n',
    );
    const unsupported = [
      /320\+/u,
      /45\+/u,
      /AED\s*2\.4M/iu,
      /98%/u,
      /\b(?:response[ -]?time|timing)\b/iu,
      /\b(?:instant|same[ -]day|within\s+\d+\s+(?:minutes?|hours?|days?)|\d+\s*(?:to|–|-)\s*\d+\s+days?|\d+\s*(?:seconds?|minutes?))\b/iu,
      /\b(?:fine|fines|penalty|penalties)\b/iu,
      /\bguarantee(?:d|s)?\b/iu,
      /zero\s+(?:surprise|surprises|surprise fees|fines|variance|upsells)/iu,
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu,
      /\b(?:mailto|tel):/iu,
      samplePhonePattern,
      /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b[^\n<]{0,30}\b(?:am|pm|\d{1,2}:\d{2})\b/iu,
    ];

    for (const claim of unsupported) assert.doesNotMatch(allRouteSource, claim);
    assert.doesNotMatch(`${contactSource}\n${contactBodySource}`, sampleAddressPattern);
  });
});
