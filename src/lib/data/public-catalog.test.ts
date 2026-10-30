import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPublicCatalogCacheKey,
  getPublicCatalogOrderColumns,
  listPublicCatalog,
  normalizePublicCatalogQuery,
  type PublicCatalogStore,
} from './public-catalog';

test('uses only real deterministic order columns for each public catalog resource', () => {
  assert.deepEqual(getPublicCatalogOrderColumns('authorities'), ['sort_order', 'slug', 'id']);
  assert.deepEqual(getPublicCatalogOrderColumns('costs'), ['authority', 'label', 'id']);
});

test('normalizes public catalog pagination and filters into a stable cache key', () => {
  assert.deepEqual(
    normalizePublicCatalogQuery({
      page: 0,
      pageSize: 500,
      jurisdiction: ' FREE_ZONE ',
      q: '  Fin%ance,_  ',
      authoritySlug: ' DMCC ',
    }),
    {
      page: 1,
      pageSize: 100,
      jurisdiction: 'free_zone',
      q: 'finance',
      authoritySlug: 'dmcc',
    },
  );
  assert.equal(
    buildPublicCatalogCacheKey('authorities', {
      q: 'finance',
      jurisdiction: 'free_zone',
      pageSize: 100,
      page: 1,
      authoritySlug: 'dmcc',
    }),
    'catalog:v1:authorities:authoritySlug=dmcc&jurisdiction=free_zone&page=1&pageSize=100&q=finance',
  );
});

test('returns truthful not-populated state and passes database pagination to the store', async () => {
  const calls: unknown[] = [];
  const store: PublicCatalogStore = {
    list: async (resource, query) => {
      calls.push({ resource, query });
      return { rows: [], count: 0 };
    },
  };

  const result = await listPublicCatalog('authorities', { page: 2, pageSize: 25 }, { store });

  assert.deepEqual(calls, [
    {
      resource: 'authorities',
      query: { page: 2, pageSize: 25, jurisdiction: null, q: null, authoritySlug: null },
    },
  ]);
  assert.deepEqual(result, {
    state: 'unavailable',
    reason: 'not_populated',
    retryable: false,
    items: [],
    page: 2,
    pageSize: 25,
    total: 0,
  });
});

test('preserves exact zero prices and strips source/admin fields from public payloads', async () => {
  const store: PublicCatalogStore = {
    list: async () => ({
      count: 1,
      rows: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          slug: 'reviewed-package',
          name: 'Reviewed package',
          jurisdiction: 'free_zone',
          authority_slug: 'reviewed-authority',
          price_state: 'priced',
          amount_minor: 0,
          currency: 'AED',
          recurrence: 'annual',
          effective_from: '2026-09-15',
          effective_to: null,
          version_key: 'approved-2026-09',
          version_number: 3,
          source_code: 'approved-source',
          internal_note: 'must not leak',
        },
      ],
    }),
  };

  const result = await listPublicCatalog('packages', {}, { store });

  assert.equal(result.state, 'ready');
  if (result.state !== 'ready') return;
  assert.equal(result.items[0]?.amountMinor, 0);
  assert.equal(result.items[0]?.priceState, 'priced');
  assert.equal('internalNote' in (result.items[0] ?? {}), false);
  assert.deepEqual(result.version, {
    key: 'approved-2026-09',
    number: 3,
    effectiveFrom: '2026-09-15',
    effectiveTo: null,
    sourceCode: 'approved-source',
  });
});

test('maps malformed rows and provider errors to non-disclosing unavailable states', async () => {
  const malformed = await listPublicCatalog(
    'activities',
    {},
    { store: { list: async () => ({ rows: [{ id: 'not-a-uuid' }], count: 1 }) } },
  );
  assert.deepEqual(malformed, {
    state: 'unavailable',
    reason: 'invalid_source',
    retryable: false,
    items: [],
    page: 1,
    pageSize: 24,
    total: 0,
  });

  const outage = await listPublicCatalog(
    'costs',
    {},
    { store: { list: async () => Promise.reject(new Error('password=secret host=db.internal')) } },
  );
  assert.deepEqual(outage, {
    state: 'unavailable',
    reason: 'source_unavailable',
    retryable: true,
    items: [],
    page: 1,
    pageSize: 24,
    total: 0,
  });
});
