import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildKnowledgeBaseIndex,
  filterKnowledgeBaseArticles,
  normalizeKnowledgeQuery,
} from './discovery';
import { knowledgeBaseArticles, KNOWLEDGE_BASE_CATEGORIES } from './index';

test('normalizes search deterministically', () => {
  assert.equal(normalizeKnowledgeQuery('  FREE   Zones  '), 'free zones');
});

test('bounds untrusted search values from public URLs', () => {
  assert.equal(normalizeKnowledgeQuery('x'.repeat(240)).length, 160);
});

test('searches title, description, keywords, and category label case-insensitively', () => {
  for (const query of ['OFFSHORE', 'practical overview', 'trade license process', 'Compliance']) {
    assert.ok(
      filterKnowledgeBaseArticles(knowledgeBaseArticles, KNOWLEDGE_BASE_CATEGORIES, { query })
        .length > 0,
      `${query} should match`,
    );
  }
});

test('combines query and category filters and returns no results without mutating the catalog', () => {
  const snapshot = [...knowledgeBaseArticles];
  assert.equal(
    filterKnowledgeBaseArticles(knowledgeBaseArticles, KNOWLEDGE_BASE_CATEGORIES, {
      query: 'zzzz-no-guide',
      category: 'documents',
    }).length,
    0,
  );
  assert.deepEqual(knowledgeBaseArticles, snapshot);
});

test('derives category counts and deterministic first-four featured guides', () => {
  const index = buildKnowledgeBaseIndex(knowledgeBaseArticles, KNOWLEDGE_BASE_CATEGORIES);
  assert.equal(index.categoryCounts.get('company-setup'), 1);
  assert.deepEqual(
    index.featured.map((article) => article.slug),
    knowledgeBaseArticles.slice(0, 4).map((article) => article.slug),
  );
  assert.equal(index.primaryCategories.length, 6);
  assert.equal(index.additionalCategories.length, 1);
});

test('an empty reviewed catalog produces zero counts and no featured guides', () => {
  const index = buildKnowledgeBaseIndex([], KNOWLEDGE_BASE_CATEGORIES);
  assert.equal(index.featured.length, 0);
  assert.ok([...index.categoryCounts.values()].every((count) => count === 0));
});
