import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PublicCmsPage, getPublicCmsPageView } from './PublicCmsPage';
import type { CmsPage } from '@/lib/data/pages';

function cmsPage(overrides: Partial<CmsPage> = {}): CmsPage {
  return {
    id: 'page-1',
    slug: 'hello',
    title: 'Hello',
    contentJson: {},
    contentHtml:
      '<h2>Details</h2><p onclick="evil()">Safe <strong>copy</strong></p><script>alert(1)</script>',
    heroSettings: {
      backgroundColor: '#ffffff',
      overlayColor: '#000000',
      overlayOpacity: 0.4,
      headingAlignment: 'left',
      textAlignment: 'center',
      buttonAlignment: 'right',
      backgroundImageUrl: 'https://cdn.example.com/hero.jpg',
      heading: 'Welcome',
      text: 'Supporting copy',
      buttonLabel: 'Learn more',
      buttonHref: '/about',
      minHeight: '30rem',
      maxWidth: '60rem',
      padding: '4rem 1rem',
      margin: '0',
    },
    backgroundImageMediaId: null,
    status: 'published',
    publishedAt: '2026-07-01T00:00:00.000Z',
    scheduledFor: null,
    metaTitle: null,
    metaDescription: null,
    canonicalUrl: null,
    noindex: false,
    schemaMarkup: null,
    createdBy: null,
    updatedBy: null,
    scriptHead: '<script>head()</script>',
    scriptBodyStart: '<script>start()</script>',
    scriptBodyEnd: '<script>end()</script>',
    deletedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('builds a sanitized public view from validated hero values', () => {
  const view = getPublicCmsPageView(cmsPage());
  assert.equal(view.bodyHtml, '<h2 id="details">Details</h2><p>Safe <strong>copy</strong></p>');
  assert.equal(view.hero?.backgroundImage, 'url("https://cdn.example.com/hero.jpg")');
  assert.equal(view.hero?.headingClassName, 'text-left');
  assert.equal(view.hero?.textClassName, 'text-center');
  assert.equal(view.hero?.buttonClassName, 'justify-end');
  assert.deepEqual(view.hero?.button, { href: '/about', label: 'Learn more', external: false });
});

test('chooses a readable CMS hero foreground and applies it to all hero copy', () => {
  const dark = getPublicCmsPageView(
    cmsPage({
      heroSettings: {
        ...cmsPage().heroSettings,
        backgroundColor: '#211d1b',
        overlayColor: '#000000',
        overlayOpacity: 0,
        backgroundImageUrl: null,
      },
    }),
  );
  assert.equal(dark.hero?.contentStyle.color, '#ffffff');

  const css = readFileSync(new URL('../../app/(public)/public-theme.css', import.meta.url), 'utf8');
  assert.match(css, /\.cms-editorial-hero__content\s+:is\(/u);
  assert.ok(css.includes('color: inherit;'));
});

test('uses a contrast-safe opaque treatment for an untrusted hero image', () => {
  const view = getPublicCmsPageView(
    cmsPage({
      heroSettings: {
        ...cmsPage().heroSettings,
        backgroundColor: '#ffffff',
        overlayColor: '#ffffff',
        overlayOpacity: 0,
        backgroundImageUrl: 'https://cdn.example.com/unmeasured-image.jpg',
      },
    }),
  );

  assert.equal(view.hero?.contentStyle.color, '#ffffff');
  assert.deepEqual(view.hero?.overlayStyle, { backgroundColor: '#000000', opacity: 0.6 });
});

test('omits an empty hero and requires both safe button fields', () => {
  const view = getPublicCmsPageView(
    cmsPage({
      heroSettings: {
        backgroundColor: '#ffffff',
        overlayColor: '#000000',
        overlayOpacity: 0,
        headingAlignment: 'center',
        textAlignment: 'center',
        buttonAlignment: 'center',
        heading: ' ',
        text: '',
        buttonLabel: 'Incomplete',
        buttonHref: null,
      },
    }),
  );
  assert.equal(view.hero, null);
});

test('marks external hero buttons and rejects unvalidated presentation values', () => {
  const page = cmsPage();
  page.heroSettings = { ...page.heroSettings, buttonHref: 'https://example.com/path' };
  assert.equal(getPublicCmsPageView(page).hero?.button?.external, true);

  page.heroSettings = { ...page.heroSettings, headingAlignment: 'justify' as never };
  assert.equal(getPublicCmsPageView(page).hero, null);
});

test('public component never includes advanced script slots in its element tree', () => {
  const element = PublicCmsPage({ page: cmsPage() });
  const serialized = JSON.stringify(element);
  assert.doesNotMatch(serialized, /head\(\)|start\(\)|end\(\)/);
  assert.doesNotMatch(serialized, /scriptHead|scriptBodyStart|scriptBodyEnd/);
});

test('no-hero CMS pages use the shared 96px by 20px title spacing', () => {
  const element = PublicCmsPage({
    page: cmsPage({
      heroSettings: {
        backgroundColor: '#ffffff',
        overlayColor: '#000000',
        overlayOpacity: 0,
        headingAlignment: 'center',
        textAlignment: 'center',
        buttonAlignment: 'center',
      },
    }),
  });
  const serialized = JSON.stringify(element);
  assert.match(serialized, /cms-page__title-section/);

  const css = readFileSync(new URL('../../app/(public)/public-theme.css', import.meta.url), 'utf8');
  assert.match(css, /\.site-public \.cms-page__title-section\s*{[^}]*padding-block:\s*96px 20px;/);
});

test('adds deterministic heading anchors and exposes a TOC only for long documents', () => {
  const view = getPublicCmsPageView(
    cmsPage({
      contentHtml:
        '<h2>Data we collect</h2><p>A</p><h2>Your choices</h2><p>B</p><h2>Contact</h2><p>C</p>',
    }),
  );
  assert.deepEqual(view.bodyHeadings, [
    { id: 'data-we-collect', label: 'Data we collect' },
    { id: 'your-choices', label: 'Your choices' },
    { id: 'contact', label: 'Contact' },
  ]);
  assert.match(view.bodyHtml, /<h2 id="data-we-collect">/u);
  assert.match(
    JSON.stringify(PublicCmsPage({ page: cmsPage({ contentHtml: view.bodyHtml }), kind: 'legal' })),
    /On this page/u,
  );
});

test('public hero omits insecure remote media and actions', () => {
  const unsafe = cmsPage();
  unsafe.heroSettings = {
    ...unsafe.heroSettings,
    backgroundImageUrl: 'http://cdn.example.com/hero.jpg',
    buttonHref: 'http://example.com/path',
  };
  const view = getPublicCmsPageView(unsafe);
  assert.equal(view.hero?.backgroundImage, undefined);
  assert.equal(view.hero?.button, null);

  unsafe.heroSettings = {
    ...unsafe.heroSettings,
    buttonHref: '//example.com/path',
  };
  assert.equal(getPublicCmsPageView(unsafe).hero?.button ?? null, null);
});
