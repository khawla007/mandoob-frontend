import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isP112DeclarativePrefetch,
  isP112ExpectedBrowserPrefetchAbort,
  isP112ExpectedSuppressedPrefetchConsoleError,
} from './prefetch';

test('suppresses only browser-signalled GET prefetches owned by declaration evidence', () => {
  const base = {
    method: 'GET',
    url: 'http://127.0.0.1:3001/legal/privacy?_rsc=abc',
    stateId: 'S007',
    resourceType: 'fetch',
    headers: { 'next-router-prefetch': '1' },
  };
  assert.equal(isP112DeclarativePrefetch(base), true);
  assert.equal(isP112DeclarativePrefetch({ ...base, stateId: 'S038' }), false);
  assert.equal(isP112DeclarativePrefetch({ ...base, method: 'POST' }), false);
  assert.equal(isP112DeclarativePrefetch({ ...base, headers: {} }), false);
  assert.equal(
    isP112DeclarativePrefetch({ ...base, url: 'https://example.invalid/legal/privacy' }),
    false,
  );
});

test('accepts only an allowed browser-signalled prefetch cancelled with exact ERR_ABORTED', () => {
  const base = {
    method: 'GET',
    url: 'http://127.0.0.1:3001/estimate?_rsc=abc',
    stateId: 'S007',
    resourceType: 'fetch',
    headers: { 'next-router-prefetch': '1' },
    allowed: true,
    failure: 'net::ERR_ABORTED',
  };
  assert.equal(isP112ExpectedBrowserPrefetchAbort(base), true);
  assert.equal(isP112ExpectedBrowserPrefetchAbort({ ...base, allowed: false }), false);
  assert.equal(isP112ExpectedBrowserPrefetchAbort({ ...base, failure: 'net::ERR_FAILED' }), false);
  assert.equal(isP112ExpectedBrowserPrefetchAbort({ ...base, headers: {} }), false);
});

test('accepts only exact blocked console noise for an exact in-memory suppressed URL', () => {
  const url = 'http://127.0.0.1:3001/blog?_rsc=abc';
  const base = {
    text: 'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector',
    url,
    suppressedUrls: new Set([url]),
  };
  assert.equal(isP112ExpectedSuppressedPrefetchConsoleError(base), true);
  assert.equal(
    isP112ExpectedSuppressedPrefetchConsoleError({
      ...base,
      url: 'http://127.0.0.1:3001/legal/privacy?_rsc=abc',
    }),
    false,
  );
  assert.equal(
    isP112ExpectedSuppressedPrefetchConsoleError({
      ...base,
      text: 'Failed to load resource: net::ERR_FAILED',
    }),
    false,
  );
});
