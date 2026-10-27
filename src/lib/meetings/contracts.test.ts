import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeOperationalCalendar,
  hasProcessingConsent,
  meetingCommandSchema,
  meetingSlotInputSchema,
  projectMeetingForActor,
} from './contracts';

const UUIDS = {
  actor: '11111111-1111-4111-8111-111111111111',
  company: '22222222-2222-4222-8222-222222222222',
  employee: '33333333-3333-4333-8333-333333333333',
  meeting: '44444444-4444-4444-8444-444444444444',
  operation: '55555555-5555-4555-8555-555555555555',
  tenant: '66666666-6666-4666-8666-666666666666',
};

test('slot input is Dubai-bound, future, and duration bounded', () => {
  const now = new Date('2026-10-27T06:00:00.000Z');
  assert.equal(
    meetingSlotInputSchema(now).parse({
      startsAt: '2026-10-27T08:00:00.000Z',
      endsAt: '2026-10-27T08:30:00.000Z',
      timezone: 'Asia/Dubai',
    }).timezone,
    'Asia/Dubai',
  );
  assert.throws(() =>
    meetingSlotInputSchema(now).parse({
      startsAt: '2026-10-27T05:00:00.000Z',
      endsAt: '2026-10-27T05:30:00.000Z',
      timezone: 'Asia/Dubai',
    }),
  );
  assert.throws(() =>
    meetingSlotInputSchema(now).parse({
      startsAt: '2026-10-27T08:00:00.000Z',
      endsAt: '2026-10-27T12:00:00.000Z',
      timezone: 'Asia/Dubai',
    }),
  );
});

test('meeting commands require stable operation ids and optimistic versions', () => {
  assert.deepEqual(
    meetingCommandSchema.parse({
      meetingId: UUIDS.meeting,
      operationId: UUIDS.operation,
      expectedVersion: 3,
    }),
    { meetingId: UUIDS.meeting, operationId: UUIDS.operation, expectedVersion: 3 },
  );
  assert.throws(() =>
    meetingCommandSchema.parse({
      meetingId: UUIDS.meeting,
      operationId: 'retry-me',
      expectedVersion: 0,
    }),
  );
});

test('calendar composition preserves renewal identity and deterministic ordering', () => {
  const items = composeOperationalCalendar(
    [
      { id: 'renewal-b', dueDate: '2026-11-12', label: 'Licence' },
      { id: 'renewal-a', dueDate: '2026-11-12', label: 'Visa' },
    ],
    [
      {
        id: UUIDS.meeting,
        scheduledAt: '2026-11-12T08:00:00.000Z',
        title: 'Consultation',
        status: 'scheduled',
        href: '/meeting',
      },
    ],
  );
  assert.deepEqual(
    items.map(({ source, sourceId }) => `${source}:${sourceId}`),
    ['renewal:renewal-a', 'renewal:renewal-b', `meeting:${UUIDS.meeting}`],
  );
  assert.equal(items[0]?.label, 'Visa');
});

test('employee projection requires an explicit participant while company roles remain scoped', () => {
  const meeting = {
    id: UUIDS.meeting,
    tenantId: UUIDS.tenant,
    companyId: UUIDS.company,
    participantProfileIds: [UUIDS.employee],
  };
  assert.equal(
    projectMeetingForActor(meeting, {
      actorId: UUIDS.employee,
      role: 'employee',
      tenantId: UUIDS.tenant,
      companyId: UUIDS.company,
    }),
    true,
  );
  assert.equal(
    projectMeetingForActor(meeting, {
      actorId: UUIDS.actor,
      role: 'employee',
      tenantId: UUIDS.tenant,
      companyId: UUIDS.company,
    }),
    false,
  );
  assert.equal(
    projectMeetingForActor(meeting, {
      actorId: UUIDS.actor,
      role: 'pro',
      tenantId: UUIDS.tenant,
      companyId: UUIDS.company,
    }),
    true,
  );
});

test('recording, transcription, and AI consent must all be current and granted', () => {
  assert.equal(
    hasProcessingConsent([
      { purpose: 'recording', granted: true, withdrawnAt: null },
      { purpose: 'transcription', granted: true, withdrawnAt: null },
      { purpose: 'ai_summary', granted: true, withdrawnAt: null },
    ]),
    true,
  );
  assert.equal(
    hasProcessingConsent([
      { purpose: 'recording', granted: true, withdrawnAt: null },
      { purpose: 'transcription', granted: true, withdrawnAt: '2026-10-27T07:00:00Z' },
      { purpose: 'ai_summary', granted: true, withdrawnAt: null },
    ]),
    false,
  );
});
