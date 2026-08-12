import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSignalDeadline } from './widget-format';

test('formats date-only deadlines without inventing a time', () => {
  assert.equal(formatSignalDeadline('2026-08-12', 'en-US'), 'Aug 12, 2026');
  assert.doesNotMatch(formatSignalDeadline('2026-08-12', 'ar-AE') ?? '', /:/);
});

test('formats timestamps in Asia/Dubai at the UTC date boundary', () => {
  assert.equal(formatSignalDeadline('2026-08-11T20:30:00.000Z', 'en-US'), 'Aug 12, 2026, 12:30 AM');
  assert.equal(formatSignalDeadline(null, 'en-US'), null);
});
