import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  respondWithPublicAuthorityDetail,
  respondWithPublicCatalog,
} from '@/lib/data/public-catalog-http';

test('public catalog HTTP responses never cache unavailable or invalid states', async () => {
  const response = await respondWithPublicCatalog(
    'authorities',
    new Request('https://example.test/api/v1/public/catalog/authorities?page=2&pageSize=500'),
    {
      load: async (_resource, query) => ({
        state: 'unavailable',
        reason: 'source_unavailable',
        retryable: true,
        items: [],
        page: Number(query.page ?? 1),
        pageSize: 100,
        total: 0,
      }),
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), {
    state: 'unavailable',
    reason: 'source_unavailable',
    retryable: true,
    items: [],
    page: 2,
    pageSize: 100,
    total: 0,
  });
});

test('public catalog HTTP responses cache only safe published payloads', async () => {
  const response = await respondWithPublicCatalog(
    'costs',
    new Request('https://example.test/api/v1/public/catalog/costs?jurisdiction=free_zone'),
    {
      load: async () => ({
        state: 'ready',
        items: [],
        page: 1,
        pageSize: 24,
        total: 1,
        version: {
          key: 'reviewed',
          number: 1,
          effectiveFrom: '2026-09-15',
          effectiveTo: null,
          sourceCode: 'approved-source',
        },
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
});

test('each public catalog route is a read-only GET adapter', () => {
  const routes = [
    './authorities/route.ts',
    './activities/route.ts',
    './packages/route.ts',
    './costs/route.ts',
    './authorities/[slug]/route.ts',
  ];
  for (const relative of routes) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /export async function GET\(/u, relative);
    assert.doesNotMatch(source, /export async function (?:POST|PUT|PATCH|DELETE)\(/u, relative);
  }
});

test('authority detail distinguishes a missing slug from an unpopulated catalog', async () => {
  const response = await respondWithPublicAuthorityDetail('missing-authority', {
    load: async (_resource, query) =>
      query.authoritySlug
        ? {
            state: 'unavailable',
            reason: 'not_populated',
            retryable: false,
            items: [],
            page: 1,
            pageSize: 1,
            total: 0,
          }
        : {
            state: 'ready',
            items: [],
            page: 1,
            pageSize: 1,
            total: 2,
            version: {
              key: 'reviewed',
              number: 1,
              effectiveFrom: '2026-09-15',
              effectiveTo: null,
              sourceCode: 'approved-source',
            },
          },
  });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { state: 'missing', resource: 'authority' });
});
