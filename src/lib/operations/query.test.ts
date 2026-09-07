import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCalendarHref, buildTaskHref, parseCalendarSearch, parseTaskSearch } from './query';

test('task search rejects repeated and unsupported values', () => {
  assert.deepEqual(
    parseTaskSearch({
      domain: ['document', 'renewal'],
      priority: 'loud',
      status: 'open',
      page: '0',
    }),
    { domain: 'all', priority: 'all', status: 'open', page: 1 },
  );
});

test('task href emits only consumed non-default context', () => {
  assert.equal(
    buildTaskHref('/t/company/tasks', {
      domain: 'renewal',
      priority: 'urgent',
      status: 'all',
      page: 2,
    }),
    '/t/company/tasks?domain=renewal&priority=urgent&page=2',
  );
});

test('calendar search validates view, Dubai date, type, and status', () => {
  assert.deepEqual(
    parseCalendarSearch({
      view: 'grid',
      date: '2026-02-30',
      type: ['meeting', 'renewal'],
      status: 'scheduled',
    }),
    { view: 'list', date: null, type: 'all', status: 'scheduled' },
  );
});

test('calendar href preserves exact valid filter context', () => {
  assert.equal(
    buildCalendarHref('/admin/calendar', {
      view: 'month',
      date: '2026-09-07',
      type: 'meeting',
      status: 'scheduled',
    }),
    '/admin/calendar?view=month&date=2026-09-07&type=meeting&status=scheduled',
  );
});
