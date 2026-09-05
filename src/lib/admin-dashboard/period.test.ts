import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDashboardPeriod, resolveDashboardPeriod } from './period';

test('accepts only a single supported reporting period', () => {
  assert.equal(parseDashboardPeriod('7'), 7);
  assert.equal(parseDashboardPeriod('30'), 30);
  assert.equal(parseDashboardPeriod('90'), 90);
  for (const value of [undefined, '', '0', '31', '<script>', ['7', '90']]) {
    assert.equal(parseDashboardPeriod(value), 30);
  }
});

test('builds adjacent half-open Dubai periods from an injected clock', () => {
  const value = resolveDashboardPeriod('30', new Date('2026-09-01T10:30:00.000Z'));
  assert.deepEqual(value, {
    days: 30,
    generatedAt: '2026-09-01T10:30:00.000Z',
    current: {
      start: '2026-08-02T20:00:00.000Z',
      end: '2026-09-01T20:00:00.000Z',
      startDate: '2026-08-03',
      endDate: '2026-09-01',
    },
    comparison: {
      start: '2026-07-03T20:00:00.000Z',
      end: '2026-08-02T20:00:00.000Z',
      startDate: '2026-07-04',
      endDate: '2026-08-02',
    },
  });
});
