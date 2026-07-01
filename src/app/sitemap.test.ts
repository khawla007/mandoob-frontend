import assert from 'node:assert/strict';
import { test } from 'node:test';
import sitemap, { buildPublicSitemap, getAuthoritySlugs } from './sitemap';
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
