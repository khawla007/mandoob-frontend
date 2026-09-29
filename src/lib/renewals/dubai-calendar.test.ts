import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDubaiDays,
  buildRenewalCalendarMonth,
  dubaiBusinessDate,
  renewalBucket,
  renewalUrgency,
} from './dubai-calendar';

test('Dubai business date flips at 20:00 UTC including month, year and leap boundaries', () => {
  assert.equal(dubaiBusinessDate(new Date('2026-12-31T19:59:59Z')), '2026-12-31');
  assert.equal(dubaiBusinessDate(new Date('2026-12-31T20:00:00Z')), '2027-01-01');
  assert.equal(dubaiBusinessDate(new Date('2026-01-31T20:00:00Z')), '2026-02-01');
  assert.equal(dubaiBusinessDate(new Date('2028-02-28T20:00:00Z')), '2028-02-29');
  assert.equal(addDubaiDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDubaiDays('2027-02-28', 1), '2027-03-01');
  assert.equal(addDubaiDays('2026-12-31', 1), '2027-01-01');
});

test('urgency boundaries are explicit: overdue, due today, upcoming', () => {
  assert.equal(renewalUrgency('2026-09-28', '2026-09-29'), 'overdue');
  assert.equal(renewalUrgency('2026-09-29', '2026-09-29'), 'due_today');
  assert.equal(renewalUrgency('2026-09-30', '2026-09-29'), 'upcoming');
});

test('dashboard buckets follow PRD urgency groups', () => {
  const today = '2026-09-29';
  assert.equal(renewalBucket('2026-09-20', today), 'overdue');
  assert.equal(renewalBucket('2026-09-29', today), 'this_week');
  assert.equal(renewalBucket('2026-10-06', today), 'this_week');
  assert.equal(renewalBucket('2026-10-07', today), 'this_month');
  assert.equal(renewalBucket('2026-10-29', today), 'this_month');
  assert.equal(renewalBucket('2026-10-30', today), 'next_90');
  assert.equal(renewalBucket('2026-12-28', today), 'next_90');
  assert.equal(renewalBucket('2026-12-29', today), 'later');
});

test('calendar month projection groups renewals by Dubai due date, sorted and bounded', () => {
  const month = buildRenewalCalendarMonth(
    [
      { id: 'b', dueDate: '2028-02-29', label: 'Leap' },
      { id: 'a', dueDate: '2028-02-29', label: 'Leap A' },
      { id: 'c', dueDate: '2028-03-01', label: 'Next month' },
      { id: 'd', dueDate: '2028-02-01', label: 'First' },
    ],
    '2028-02',
  );
  assert.equal(month.days.length, 29);
  assert.deepEqual(
    month.days.find((day) => day.date === '2028-02-29')?.items.map((item) => item.id),
    ['a', 'b'],
  );
  assert.equal(month.days[0].items[0].id, 'd');
  assert.equal(month.total, 3);
  assert.equal(buildRenewalCalendarMonth([], '2027-02').days.length, 28);
  assert.throws(() => buildRenewalCalendarMonth([], '2027-13'), /INVALID_CALENDAR_MONTH/u);
});
