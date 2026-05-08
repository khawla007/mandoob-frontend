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
    ['/', '/estimate', '/apply', '/pricing', '/knowledge-base'].filter((path) => !paths(entries).includes(path)),
    [],
  );
  assert.ok(paths(entries).includes('/knowledge-base/mainland-vs-free-zone'));
  assert.ok(paths(entries).includes('/knowledge-base/uae-company-documents'));
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
