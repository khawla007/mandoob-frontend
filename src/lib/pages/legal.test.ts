import assert from 'node:assert/strict';
import test from 'node:test';

import type { CmsPage } from '@/lib/data/pages';
import { isLegalCmsPageSlug, legalCmsPagePath, resolveLegalCmsPage } from './legal';

function page(overrides: Partial<CmsPage> = {}): CmsPage {
  return {
    id: 'page-1',
    slug: 'privacy',
    title: 'Privacy Policy',
    contentJson: {},
    contentHtml: '<p>Body</p>',
    heroSettings: {
      backgroundColor: '#ffffff',
      overlayColor: '#000000',
      overlayOpacity: 0,
      headingAlignment: 'center',
      textAlignment: 'center',
      buttonAlignment: 'center',
    },
    backgroundImageMediaId: null,
    status: 'published',
    publishedAt: '2026-05-22T00:00:00.000Z',
    scheduledFor: null,
    metaTitle: null,
    metaDescription: null,
    canonicalUrl: 'https://mandoob.ae/legal/privacy',
    noindex: false,
    schemaMarkup: null,
    scriptHead: null,
    scriptBodyStart: null,
    scriptBodyEnd: null,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    ...overrides,
  };
}

test('allows only the four legal CMS slugs and maps their canonical paths', () => {
  for (const slug of ['privacy', 'terms', 'pdpl', 'trust']) {
    assert.equal(isLegalCmsPageSlug(slug), true);
    assert.equal(legalCmsPagePath(slug), `/legal/${slug}`);
  }

  assert.equal(isLegalCmsPageSlug('about'), false);
  assert.equal(isLegalCmsPageSlug('Privacy'), false);
  assert.equal(legalCmsPagePath('about'), null);
});

test('does not query unsupported legal slugs', async () => {
  let calls = 0;
  const resolved = await resolveLegalCmsPage('about', async () => {
    calls += 1;
    return page();
  });

  assert.equal(resolved, null);
  assert.equal(calls, 0);
});

test('returns only currently published legal CMS records', async () => {
  const now = new Date('2026-07-14T00:00:00.000Z');
  assert.equal((await resolveLegalCmsPage('privacy', async () => page(), now))?.slug, 'privacy');

  for (const unavailable of [
    page({ status: 'draft' }),
    page({ publishedAt: '2026-07-15T00:00:00.000Z' }),
    page({ deletedAt: '2026-07-01T00:00:00.000Z' }),
  ]) {
    assert.equal(await resolveLegalCmsPage('privacy', async () => unavailable, now), null);
  }
});
