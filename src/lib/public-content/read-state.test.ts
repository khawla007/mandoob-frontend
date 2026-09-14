import assert from 'node:assert/strict';
import test from 'node:test';

import {
  emptyState,
  loadingState,
  missingState,
  noResultsState,
  readyState,
  resolvePublicRead,
  unavailableState,
} from './read-state';

test('public read states use exclusive discriminants and retain useful context', () => {
  assert.deepEqual(loadingState(), { status: 'loading' });
  assert.deepEqual(readyState(['guide']), { status: 'ready', data: ['guide'] });
  assert.deepEqual(emptyState(), { status: 'empty' });
  assert.deepEqual(noResultsState('  visa  ', ['visa']), {
    status: 'no-results',
    query: 'visa',
    activeFilters: ['visa'],
  });
  assert.deepEqual(unavailableState(), { status: 'unavailable' });
  assert.deepEqual(missingState(), { status: 'missing' });
});

test('collection resolver separates ready, empty, and unavailable without leaking errors', async () => {
  assert.deepEqual(await resolvePublicRead(async () => ['post']), {
    status: 'ready',
    data: ['post'],
  });
  assert.deepEqual(await resolvePublicRead(async () => []), { status: 'empty' });

  const secret = 'provider password=do-not-publish';
  const result = await resolvePublicRead(async () => {
    throw new Error(secret);
  });
  assert.deepEqual(result, { status: 'unavailable' });
  assert.doesNotMatch(JSON.stringify(result), /password|provider|do-not-publish/u);
});
