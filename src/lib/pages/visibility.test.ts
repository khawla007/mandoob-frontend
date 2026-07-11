import assert from 'node:assert/strict';
import test from 'node:test';
import { isCmsPagePublic } from './visibility';

const now = new Date('2026-07-10T12:00:00.000Z');
test('only already-published, non-deleted pages are public', () => {
  assert.equal(isCmsPagePublic({ status: 'published', publishedAt: '2026-07-10T11:59:59.000Z' }, now), true);
  assert.equal(isCmsPagePublic({ status: 'draft', publishedAt: now }, now), false);
  assert.equal(isCmsPagePublic({ status: 'published', publishedAt: '2026-07-10T12:00:01.000Z' }, now), false);
  assert.equal(isCmsPagePublic({ status: 'published', publishedAt: now, deletedAt: now }, now), false);
  assert.equal(isCmsPagePublic({ status: 'published', publishedAt: 'invalid' }, now), false);
});
