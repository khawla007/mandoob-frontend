import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCmsPageMetadata, resolvePublicCmsPage, serializeSchema } from '@/components/pages/PublicCmsPage';
import type { CmsPage } from '@/lib/data/pages';

function cmsPage(overrides: Partial<CmsPage> = {}): CmsPage {
  return {
    id: 'page-1', slug: 'hello', title: 'Fallback title', contentJson: {}, contentHtml: '<p>Body</p>',
    heroSettings: { backgroundColor: '#fff', overlayColor: '#000', overlayOpacity: 0, headingAlignment: 'center', textAlignment: 'center', buttonAlignment: 'center' },
    backgroundImageMediaId: null, status: 'published', publishedAt: '2026-07-01T00:00:00.000Z', scheduledFor: null,
    metaTitle: 'SEO title', metaDescription: 'SEO description', canonicalUrl: 'https://mandoob.ae/hello', noindex: true,
    schemaMarkup: null, createdBy: null, updatedBy: null, scriptHead: null, scriptBodyStart: null, scriptBodyEnd: null,
    deletedAt: null, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', ...overrides,
  };
}

test('builds published metadata with fallbacks, canonical and noindex robots', () => {
  assert.deepEqual(buildCmsPageMetadata(cmsPage()), {
    title: 'SEO title', description: 'SEO description', alternates: { canonical: 'https://mandoob.ae/hello' },
    robots: { index: false, follow: false },
  });
  assert.deepEqual(buildCmsPageMetadata(cmsPage({ metaTitle: null, metaDescription: null, canonicalUrl: null, noindex: false })), {
    title: 'Fallback title', description: 'Body', robots: { index: true, follow: true },
  });
});

test('unavailable metadata is empty and leaks no page fields', () => {
  assert.deepEqual(buildCmsPageMetadata(null), {});
});

test('resolution rejects reserved slugs and every unavailable visibility state', async () => {
  const now = new Date('2026-07-10T12:00:00.000Z');
  let calls = 0;
  const load = async () => { calls += 1; return cmsPage(); };
  assert.equal(await resolvePublicCmsPage('admin', load, now), null);
  assert.equal(calls, 0);

  for (const page of [
    null,
    cmsPage({ status: 'draft' }),
    cmsPage({ status: 'archived' }),
    cmsPage({ publishedAt: '2026-07-10T12:00:01.000Z' }),
    cmsPage({ deletedAt: '2026-07-01T00:00:00.000Z' }),
  ]) {
    assert.equal(await resolvePublicCmsPage('hello', async () => page, now), null);
  }
});

test('serializes schema JSON-LD while escaping HTML-significant less-than characters', () => {
  const value = serializeSchema({ '@context': 'https://schema.org', name: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(value, /</);
  assert.match(value, /\\u003c\/script>/);
});
