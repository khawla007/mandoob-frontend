import assert from 'node:assert/strict';
import test from 'node:test';

import {
  meetingBadgeVariant,
  partitionMeetings,
  safeExternalMeetingHref,
} from './meeting-presentation';

test('meeting statuses retain explicit semantic badge mapping', () => {
  assert.equal(meetingBadgeVariant('scheduled'), 'secondary');
  assert.equal(meetingBadgeVariant('recording_ready'), 'default');
  assert.equal(meetingBadgeVariant('cancelled'), 'outline');
  assert.equal(meetingBadgeVariant('no_show'), 'destructive');
});

test('meeting partition is deterministic with injected current time', () => {
  const rows = [
    { id: 'past', status: 'completed' as const, scheduledAt: '2026-09-06T08:00:00.000Z' },
    { id: 'future', status: 'scheduled' as const, scheduledAt: '2026-09-08T08:00:00.000Z' },
  ];
  const result = partitionMeetings(rows, new Date('2026-09-07T00:00:00.000Z'));
  assert.deepEqual(
    result.upcoming.map((row) => row.id),
    ['future'],
  );
  assert.deepEqual(
    result.past.map((row) => row.id),
    ['past'],
  );
});

test('external meeting links permit only https destinations', () => {
  assert.equal(safeExternalMeetingHref('https://meet.example/room'), 'https://meet.example/room');
  assert.equal(safeExternalMeetingHref('http://meet.example/room'), null);
  assert.equal(safeExternalMeetingHref('javascript:alert(1)'), null);
});
