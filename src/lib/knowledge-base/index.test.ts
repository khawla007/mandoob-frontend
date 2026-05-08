import assert from 'node:assert/strict';
import { test } from 'node:test';

import { seededCostDataRows } from '@/lib/estimator/seed-data';
import {
  KNOWLEDGE_BASE_CATEGORIES,
  knowledgeBaseArticles,
  authoritySlugFor,
  buildArticleJsonLd,
  buildEstimateHandoffUrl,
  buildFaqPageJsonLd,
  getArticleBySlug,
  getAuthorityPages,
} from './index';

test('knowledge base articles have unique slugs and required categories', () => {
  const slugs = knowledgeBaseArticles.map((article) => article.slug);
  assert.equal(new Set(slugs).size, slugs.length);

  const categoryIds = new Set(KNOWLEDGE_BASE_CATEGORIES.map((category) => category.id));
  assert.deepEqual(
    [...categoryIds].sort(),
    ['company-setup', 'compliance', 'costs', 'documents', 'jurisdictions', 'timelines', 'visas'].sort(),
  );

  for (const article of knowledgeBaseArticles) {
    assert.equal(getArticleBySlug(article.slug)?.slug, article.slug);
    assert.ok(categoryIds.has(article.category));
  }
});

test('related article slugs resolve to existing articles', () => {
  const slugs = new Set(knowledgeBaseArticles.map((article) => article.slug));

  for (const article of knowledgeBaseArticles) {
    for (const relatedSlug of article.relatedSlugs) {
      assert.ok(slugs.has(relatedSlug), `${article.slug} references missing related article ${relatedSlug}`);
      assert.notEqual(relatedSlug, article.slug);
    }
  }
});

test('authority pages have unique slugs and cover all estimator authorities', () => {
  const authorityPages = getAuthorityPages();
  const authoritySlugs = authorityPages.map((page) => page.slug);
  const estimatorAuthorities = new Set(seededCostDataRows.map((row) => row.authority));

  assert.equal(new Set(authoritySlugs).size, authoritySlugs.length);
  assert.equal(authorityPages.length, estimatorAuthorities.size);

  for (const authority of estimatorAuthorities) {
    const slug = authoritySlugFor(authority);
    assert.ok(authorityPages.some((page) => page.slug === slug), `${authority} is missing authority page data`);
  }
});

test('estimate handoff URLs include jurisdiction and authority where available', () => {
  const dmcc = getAuthorityPages().find((page) => page.authority === 'DMCC');
  assert.ok(dmcc);

  const handoffUrl = buildEstimateHandoffUrl(dmcc);
  assert.equal(handoffUrl.pathname, '/estimate');
  assert.equal(handoffUrl.searchParams.get('jurisdiction'), 'free_zone');
  assert.equal(handoffUrl.searchParams.get('authority'), 'DMCC');
  assert.equal(handoffUrl.searchParams.get('emirate'), 'dubai');
});

test('JSON-LD helpers return expected schema types', () => {
  const article = knowledgeBaseArticles[0];
  assert.ok(article);

  const articleJsonLd = buildArticleJsonLd(article, 'https://example.com');
  assert.equal(articleJsonLd['@type'], 'Article');
  assert.equal(articleJsonLd.headline, article.title);

  const faqJsonLd = buildFaqPageJsonLd(article.faq);
  assert.equal(faqJsonLd['@type'], 'FAQPage');
  assert.equal(faqJsonLd.mainEntity[0]?.['@type'], 'Question');
});
