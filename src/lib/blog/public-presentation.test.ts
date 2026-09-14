import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blogPageHref,
  buildBlogArticleJsonLd,
  filterBlogPosts,
  normalizeBlogQuery,
  parseBlogPage,
  resolveBlogDetail,
  resolveBlogIndex,
} from './public-presentation';
import type { BlogPost } from '@/lib/data/blog';

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'post-1',
    slug: 'setup-guide',
    title: 'Setup guide',
    excerpt: 'Free zone planning',
    contentJson: {},
    contentHtml: '<p>Body</p>',
    status: 'published',
    publishedAt: '2026-01-01T00:00:00.000Z',
    scheduledFor: null,
    metaTitle: null,
    metaDescription: null,
    canonicalUrl: null,
    noindex: false,
    featuredMediaId: null,
    termIds: [],
    galleryMediaIds: [],
    authorId: null,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

test('index resolver separates ready, empty, and unavailable', async () => {
  assert.equal((await resolveBlogIndex(async () => [post()])).status, 'ready');
  assert.equal((await resolveBlogIndex(async () => [])).status, 'empty');
  assert.equal(
    (
      await resolveBlogIndex(async () => {
        throw new Error('database secret');
      })
    ).status,
    'unavailable',
  );
});

test('detail resolver separates published missing from read failure', async () => {
  assert.equal((await resolveBlogDetail('setup-guide', async () => post())).status, 'ready');
  assert.equal((await resolveBlogDetail('missing', async () => null)).status, 'missing');
  const unavailable = await resolveBlogDetail('setup-guide', async () => {
    throw new Error('provider secret');
  });
  assert.deepEqual(unavailable, { status: 'unavailable' });
  assert.doesNotMatch(JSON.stringify(unavailable), /provider|secret/u);
});

test('search uses only supplied public title and excerpt', () => {
  assert.equal(filterBlogPosts([post()], ' FREE   ZONE ').length, 1);
  assert.equal(filterBlogPosts([post()], 'not-present').length, 0);
});

test('search normalization bounds untrusted URL values', () => {
  assert.equal(normalizeBlogQuery('x'.repeat(240)).length, 160);
});

test('pagination accepts only canonical positive integers and clamps excessive pages', () => {
  for (const value of [undefined, '0', '-2', '2.5', '2posts', 'nope', ['', '2']]) {
    assert.equal(parseBlogPage(value, 4), 1);
  }
  assert.equal(parseBlogPage('3', 4), 3);
  assert.equal(parseBlogPage('999', 4), 4);
});

test('pagination links preserve search and use stable first-page URLs', () => {
  assert.equal(blogPageHref(1, 'visa'), '/blog?q=visa');
  assert.equal(blogPageHref(2, 'visa'), '/blog?q=visa&page=2');
  assert.equal(blogPageHref(1, ''), '/blog');
});

test('Article JSON-LD contains accepted fields only', () => {
  assert.deepEqual(buildBlogArticleJsonLd(post(), 'https://mandoob.ae'), {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Setup guide',
    description: 'Free zone planning',
    datePublished: '2026-01-01T00:00:00.000Z',
    dateModified: '2026-01-02T00:00:00.000Z',
    url: 'https://mandoob.ae/blog/setup-guide',
  });
});
