import assert from 'node:assert/strict';
import test from 'node:test';

import { isExpectedNextPrefetchAbort } from './p2-acceptance-request-failures';

const baseFailure = {
  errorText: 'net::ERR_ABORTED',
  resourceType: 'fetch',
  isNavigationRequest: false,
  url: 'http://127.0.0.1:3100/account/security',
  headers: { 'next-router-prefetch': '1' },
};

test('recognizes a same-origin Next.js Link prefetch abort', () => {
  assert.equal(isExpectedNextPrefetchAbort(baseFailure, 'http://127.0.0.1:3100'), true);
  assert.equal(
    isExpectedNextPrefetchAbort(
      { ...baseFailure, headers: { purpose: 'prefetch' } },
      'http://127.0.0.1:3100',
    ),
    true,
  );
  assert.equal(
    isExpectedNextPrefetchAbort(
      { ...baseFailure, headers: { 'sec-purpose': 'prefetch' } },
      'http://127.0.0.1:3100',
    ),
    true,
  );
});

test('does not hide unrelated aborted requests', () => {
  const cases = [
    { ...baseFailure, errorText: 'net::ERR_FAILED' },
    { ...baseFailure, resourceType: 'document' },
    { ...baseFailure, isNavigationRequest: true },
    { ...baseFailure, headers: {} },
    { ...baseFailure, url: 'https://example.com/account/security' },
  ];

  for (const failure of cases) {
    assert.equal(isExpectedNextPrefetchAbort(failure, 'http://127.0.0.1:3100'), false);
  }
});
