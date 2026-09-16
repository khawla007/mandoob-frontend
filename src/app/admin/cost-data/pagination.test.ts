import assert from 'node:assert/strict';
import test from 'node:test';

import { costDataPageHref, parseCostDataPage } from './pagination';

test('parseCostDataPage clamps malformed values and pages beyond the result set', () => {
  assert.deepEqual(parseCostDataPage(undefined, 125), { page: 1, pageSize: 50, pageCount: 3 });
  assert.deepEqual(parseCostDataPage('-2', 125), { page: 1, pageSize: 50, pageCount: 3 });
  assert.deepEqual(parseCostDataPage('99', 125), { page: 3, pageSize: 50, pageCount: 3 });
  assert.deepEqual(parseCostDataPage('2', 0), { page: 1, pageSize: 50, pageCount: 1 });
});

test('costDataPageHref preserves filters and removes page one', () => {
  const params = { q: 'visa fee', active: 'active', page: '3' };
  assert.equal(costDataPageHref(params, 2), '/admin/cost-data?q=visa+fee&active=active&page=2');
  assert.equal(costDataPageHref(params, 1), '/admin/cost-data?q=visa+fee&active=active');
});
