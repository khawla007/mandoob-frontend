import assert from 'node:assert/strict';
import test from 'node:test';

import { PublicCmsPage, getPublicCmsPageView } from './PublicCmsPage';
import type { CmsPage } from '@/lib/data/pages';

function cmsPage(overrides: Partial<CmsPage> = {}): CmsPage {
  return {
    id: 'page-1', slug: 'hello', title: 'Hello', contentJson: {},
    contentHtml: '<h2>Details</h2><p onclick="evil()">Safe <strong>copy</strong></p><script>alert(1)</script>',
    heroSettings: {
      backgroundColor: '#ffffff', overlayColor: '#000000', overlayOpacity: 0.4,
      headingAlignment: 'left', textAlignment: 'center', buttonAlignment: 'right',
      backgroundImageUrl: 'https://cdn.example.com/hero.jpg', heading: 'Welcome', text: 'Supporting copy',
      buttonLabel: 'Learn more', buttonHref: '/about', minHeight: '30rem', maxWidth: '60rem',
      padding: '4rem 1rem', margin: '0',
    },
    backgroundImageMediaId: null, status: 'published', publishedAt: '2026-07-01T00:00:00.000Z',
    scheduledFor: null, metaTitle: null, metaDescription: null, canonicalUrl: null, noindex: false,
    schemaMarkup: null, createdBy: null, updatedBy: null,
    scriptHead: '<script>head()</script>', scriptBodyStart: '<script>start()</script>',
    scriptBodyEnd: '<script>end()</script>', deletedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('builds a sanitized public view from validated hero values', () => {
  const view = getPublicCmsPageView(cmsPage());
  assert.equal(view.bodyHtml, '<h2>Details</h2><p>Safe <strong>copy</strong></p>');
  assert.equal(view.hero?.backgroundImage, 'url("https://cdn.example.com/hero.jpg")');
  assert.equal(view.hero?.headingClassName, 'text-left');
  assert.equal(view.hero?.textClassName, 'text-center');
  assert.equal(view.hero?.buttonClassName, 'justify-end');
  assert.deepEqual(view.hero?.button, { href: '/about', label: 'Learn more', external: false });
});

test('omits an empty hero and requires both safe button fields', () => {
  const view = getPublicCmsPageView(cmsPage({
    heroSettings: {
      backgroundColor: '#ffffff', overlayColor: '#000000', overlayOpacity: 0,
      headingAlignment: 'center', textAlignment: 'center', buttonAlignment: 'center',
      heading: ' ', text: '', buttonLabel: 'Incomplete', buttonHref: null,
    },
  }));
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
