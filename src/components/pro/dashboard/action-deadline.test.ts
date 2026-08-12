import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatActionCountdown } from './action-deadline';

const labels = {
  breached: 'Breached',
  today: 'Due today',
  minutes: '{count} min',
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

test('action countdown uses ceiling minute semantics below one hour', () => {
  const now = '2026-08-12T08:00:00.000Z';
  for (const [minutes, expected] of [
    [5, '5 min'],
    [42, '42 min'],
    [59, '59 min'],
  ] as const) {
    const deadline = new Date(Date.parse(now) + minutes * 60_000).toISOString();
    assert.equal(formatActionCountdown(deadline, now, 'en', labels), expected);
  }
  assert.equal(formatActionCountdown('2026-08-12T09:00:00.000Z', now, 'en', labels), '1 hr');
  assert.equal(formatActionCountdown('2026-08-12T07:59:59.999Z', now, 'en', labels), 'Breached');
});
