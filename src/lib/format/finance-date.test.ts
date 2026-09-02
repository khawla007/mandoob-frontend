import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFinanceDate } from './finance-date';

test('formats valid finance dates in Asia/Dubai and safely handles invalid values', () => {
  assert.equal(formatFinanceDate('2026-08-31T20:00:00.000Z', 'en', 'Unavailable'), 'Sep 1, 2026');
  assert.equal(formatFinanceDate('not-a-date', 'en', 'Unavailable'), 'Unavailable');
  assert.equal(formatFinanceDate(null, 'en', 'Unavailable'), 'Unavailable');
});
