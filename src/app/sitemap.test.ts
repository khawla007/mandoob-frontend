import assert from 'node:assert/strict';
import { test } from 'node:test';
import sitemap, { buildPublicSitemap, getAuthoritySlugs, loadSitemapContent } from './sitemap';
import { seededCostDataRows } from '@/lib/estimator/seed-data';

const origin = 'https://mandoob.test';

function paths(entries: Awaited<ReturnType<typeof sitemap>>): string[] {
  return entries.map((entry) => new URL(entry.url).pathname).sort();
}

test('public sitemap covers core acquisition routes and knowledge-base articles', () => {
  const entries = buildPublicSitemap({
    origin,
    knowledgeBaseArticleSlugs: ['mainland-vs-free-zone', 'uae-company-documents'],
  });

  assert.deepEqual(
    ['/', '/estimate', '/apply', '/pricing', '/knowledge-base', '/blog'].filter(
      (path) => !paths(entries).includes(path),
    ),
    [],
  );
  assert.ok(paths(entries).includes('/knowledge-base/mainland-vs-free-zone'));
  assert.ok(paths(entries).includes('/knowledge-base/uae-company-documents'));
});

test('public sitemap includes published blog posts with updated timestamps', () => {
  const entries = buildPublicSitemap({
    origin,
    knowledgeBaseArticleSlugs: [],
    blogPosts: [
      {
        slug: 'dubai-license-renewal',
        updatedAt: '2026-07-01T10:30:00.000Z',
      },
    ],
  });

  const blogEntry = entries.find((entry) => entry.url === `${origin}/blog/dubai-license-renewal`);

  assert.ok(paths(entries).includes('/blog'));
  assert.ok(blogEntry);
  assert.deepEqual(blogEntry.lastModified, new Date('2026-07-01T10:30:00.000Z'));
});

test('public sitemap excludes noindex blog posts', () => {
  const entries = buildPublicSitemap({
    origin,
    knowledgeBaseArticleSlugs: [],
    blogPosts: [
      {
        slug: 'indexable-post',
        updatedAt: '2026-07-01T10:30:00.000Z',
        noindex: false,
      },
      {
        slug: 'private-campaign-post',
        updatedAt: '2026-07-01T11:00:00.000Z',
        noindex: true,
      },
    ],
  });

  assert.ok(paths(entries).includes('/blog/indexable-post'));
  assert.equal(paths(entries).includes('/blog/private-campaign-post'), false);
});

test('public sitemap includes indexable CMS pages at root paths with updated timestamps', () => {
  const entries = buildPublicSitemap({
    origin,
    knowledgeBaseArticleSlugs: [],
    cmsPages: [
      { slug: 'about-weelp', updatedAt: '2026-07-08T09:15:00.000Z', noindex: false },
      { slug: 'private-offer', updatedAt: '2026-07-09T10:00:00.000Z', noindex: true },
    ],
  });

  const pageEntry = entries.find((entry) => entry.url === `${origin}/about-weelp`);
  assert.ok(pageEntry);
  assert.deepEqual(pageEntry.lastModified, new Date('2026-07-08T09:15:00.000Z'));
  assert.equal(pageEntry.changeFrequency, 'monthly');
  assert.equal(pageEntry.priority, 0.7);
  assert.equal(paths(entries).includes('/private-offer'), false);
});

test('public sitemap defensively deduplicates CMS paths', () => {
  const entries = buildPublicSitemap({
    origin,
    knowledgeBaseArticleSlugs: [],
    cmsPages: [
      { slug: 'pricing', updatedAt: '2026-07-08T09:15:00.000Z', noindex: false },
      { slug: 'about-weelp', updatedAt: '2026-07-08T09:15:00.000Z', noindex: false },
      { slug: 'about-weelp', updatedAt: '2026-07-09T09:15:00.000Z', noindex: false },
    ],
  });

  assert.equal(paths(entries).filter((path) => path === '/pricing').length, 1);
  assert.equal(paths(entries).filter((path) => path === '/about-weelp').length, 1);
  assert.deepEqual(
    entries.find((entry) => entry.url === `${origin}/pricing`)?.lastModified,
    new Date('2026-05-08'),
  );
});

test('public sitemap skips unsafe CMS page slugs while keeping valid CMS pages', () => {
  const entries = buildPublicSitemap({
    origin,
    knowledgeBaseArticleSlugs: [],
    cmsPages: [
      { slug: 'about-weelp', updatedAt: '2026-07-08T09:15:00.000Z', noindex: false },
      { slug: 'pricing?x=1', updatedAt: '2026-07-09T09:15:00.000Z', noindex: false },
      { slug: '/evil', updatedAt: '2026-07-09T09:15:00.000Z', noindex: false },
      { slug: ' whitespace ', updatedAt: '2026-07-09T09:15:00.000Z', noindex: false },
    ],
  });

  assert.ok(paths(entries).includes('/about-weelp'));
  assert.equal(paths(entries).includes('/pricing'), true);
  assert.equal(paths(entries).includes('/evil'), false);
  assert.equal(entries.some((entry) => entry.url.includes('?x=1')), false);
  assert.equal(paths(entries).includes('/%20whitespace%20'), false);
});

test('public sitemap keeps newest CMS page when duplicate CMS slugs are present', () => {
  const entries = buildPublicSitemap({
    origin,
    knowledgeBaseArticleSlugs: [],
    cmsPages: [
      { slug: 'about-weelp', updatedAt: '2026-07-08T09:15:00.000Z', noindex: false },
      { slug: 'about-weelp', updatedAt: '2026-07-10T09:15:00.000Z', noindex: false },
      { slug: 'about-weelp', updatedAt: '2026-07-09T09:15:00.000Z', noindex: false },
    ],
  });

  assert.equal(paths(entries).filter((path) => path === '/about-weelp').length, 1);
  assert.deepEqual(
    entries.find((entry) => entry.url === `${origin}/about-weelp`)?.lastModified,
    new Date('2026-07-10T09:15:00.000Z'),
  );
});

test('sitemap content loads blog and CMS sources independently and logs sanitized warnings', async () => {
  const warnings: unknown[][] = [];
  const result = await loadSitemapContent({
    listBlogPosts: async () => {
      throw new Error('secret database details');
    },
    listCmsPages: async () => [
      { slug: 'about-weelp', updatedAt: '2026-07-08T09:15:00.000Z', noindex: false },
    ],
    warn: (...args: unknown[]) => warnings.push(args),
  });

  assert.deepEqual(result.blogPosts, []);
  assert.equal(result.cmsPages[0]?.slug, 'about-weelp');
  assert.deepEqual(warnings, [['Could not load blog posts for sitemap']]);
});

test('sitemap content preserves blog posts when CMS loading fails', async () => {
  const result = await loadSitemapContent({
    listBlogPosts: async () => [
      { slug: 'company-guide', updatedAt: '2026-07-07T08:00:00.000Z' },
    ],
    listCmsPages: async () => {
      throw new Error('secret database details');
    },
    warn: () => undefined,
  });

  assert.equal(result.blogPosts[0]?.slug, 'company-guide');
  assert.deepEqual(result.cmsPages, []);
});

test('public sitemap covers every estimator authority company setup page', () => {
  const authoritySlugs = getAuthoritySlugs(seededCostDataRows);
  const entries = buildPublicSitemap({ origin, knowledgeBaseArticleSlugs: [] });
  const sitemapPaths = paths(entries);

  assert.equal(
    sitemapPaths.filter((path) => path.startsWith('/company-setup/')).length,
    authoritySlugs.length,
  );
  assert.ok(sitemapPaths.includes('/company-setup/dmcc'));
  assert.ok(sitemapPaths.includes('/company-setup/dubai-ded'));
  assert.deepEqual(
    authoritySlugs
      .map((slug) => `/company-setup/${slug}`)
      .filter((path) => !sitemapPaths.includes(path)),
    [],
  );
});
