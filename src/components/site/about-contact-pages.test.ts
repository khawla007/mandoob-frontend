import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const aboutSource = readFileSync(
  new URL('../../app/(public)/about/page.tsx', import.meta.url),
  'utf8',
);
const contactSource = readFileSync(
  new URL('../../app/(public)/contact/page.tsx', import.meta.url),
  'utf8',
);
const publicLayoutSource = readFileSync(
  new URL('../../app/(public)/layout.tsx', import.meta.url),
  'utf8',
);

const routes = [
  { path: '/about', source: aboutSource },
  { path: '/contact', source: contactSource },
] as const;

describe('temporary About and Contact route shells', () => {
  for (const { path, source } of routes) {
    it(`${path} is a server route with one h1 and static canonical metadata`, () => {
      assert.equal(source.match(/<h1\b/gu)?.length, 1);
      assert.match(source, /import type \{ Metadata \} from 'next';/u);
      assert.match(source, /export const metadata: Metadata\s*=\s*\{/u);
      assert.match(source, new RegExp(`alternates:\\s*\\{\\s*canonical:\\s*'${path}'`, 'u'));
      assert.doesNotMatch(source, /['"]use client['"]/u);
      assert.doesNotMatch(source, /generateMetadata/u);
    });
  }

  it('uses only real in-scope conversion routes', () => {
    assert.match(aboutSource, /href=["{]?["']\/estimate["']/u);
    assert.match(aboutSource, /href=["{]?["']\/contact["']/u);
    assert.match(contactSource, /href=["{]?["']\/estimate["']/u);

    for (const { path, source } of routes) {
      assert.doesNotMatch(source, /href\s*=\s*(?:\{\s*)?["']\s*(?:#(?:[^"']*)?)?["']/u, path);
    }
  });

  it('leaves the accepted public shell owned by the shared layout', () => {
    assert.match(publicLayoutSource, /<SiteHeader\s*\/>/u);
    assert.match(publicLayoutSource, /<main id="main"/u);
    assert.match(publicLayoutSource, /<SiteFooter\s*\/>/u);

    for (const { path, source } of routes) {
      assert.doesNotMatch(source, /SiteHeader|SiteFooter|<main\b/u, path);
    }
  });

  it('publishes no unsupported proof, timing, fine, guarantee, or sample contact claims', () => {
    const allRouteSource = routes.map(({ source }) => source).join('\n');
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
      /(?:\+?971|\b0\d{1,2})[\s()-]*\d{3}[\s-]*\d{4}\b/u,
      /\b(?:address|street|road|avenue|building|office|suite|floor|downtown)\b/iu,
      /\bhours?\b/iu,
      /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b[^\n<]{0,30}\b(?:am|pm|\d{1,2}:\d{2})\b/iu,
    ];

    for (const claim of unsupported) assert.doesNotMatch(allRouteSource, claim);
  });
});
