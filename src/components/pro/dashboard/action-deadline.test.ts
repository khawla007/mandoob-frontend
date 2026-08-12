import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatActionCountdown } from './action-deadline';

const labels = {
  breached: 'Breached',
  today: 'Due today',
  hours: '{count} hr',
  days: '{count} days',
};

test('action countdown is deterministic from the supplied generated time', () => {
  const now = '2026-08-12T08:00:00.000Z';
  assert.equal(formatActionCountdown('2026-08-12T07:00:00.000Z', now, 'en', labels), 'Breached');
  assert.equal(formatActionCountdown('2026-08-12T12:00:00.000Z', now, 'en', labels), '4 hr');
  assert.equal(formatActionCountdown('2026-08-12T08:00:00.000Z', now, 'en', labels), 'Due today');
  assert.equal(formatActionCountdown('2026-08-14T08:00:00.000Z', now, 'en', labels), '2 days');
});
