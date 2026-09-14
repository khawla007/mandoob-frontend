import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareOperationalWorkItems,
  createInternalOperationalTarget,
  normalizeCalendarEvent,
  normalizeTimelineEvents,
  settleOperationalSources,
  type OperationalWorkItem,
} from './contracts';

test('operational targets allow only canonical internal paths with consumed context', () => {
  assert.deepEqual(createInternalOperationalTarget('/t/acme/documents', { status: 'requested' }), {
    kind: 'internal',
    href: '/t/acme/documents?status=requested',
    consumedContext: { status: 'requested' },
  });
  assert.equal(createInternalOperationalTarget('https://example.com', {}), null);
  assert.equal(
    createInternalOperationalTarget('/t/acme/documents', { next: 'javascript:alert(1)' }),
    null,
  );
});

test('work item ranking is deterministic and preserves exact priority reasons', () => {
  const item = (overrides: Partial<OperationalWorkItem>): OperationalWorkItem => ({
    id: 'document:1',
    domain: 'document',
    title: 'Requested document',
    entityLabel: 'Company document',
    reason: 'A current document request is awaiting upload.',
    priority: 'active',
    priorityReason: 'requested',
    deadline: null,
    status: { domain: 'document', value: 'requested' },
    action: { status: 'unavailable', reason: 'No accepted action.' },
    target: { kind: 'unavailable', reason: 'No accepted destination.' },
    ...overrides,
  });

  const rows = [
    item({ id: 'renewal:2', priority: 'urgent', priorityReason: 'overdue' }),
    item({ id: 'document:2', priority: 'active', deadline: '2026-09-08' }),
    item({ id: 'document:1', priority: 'active', deadline: '2026-09-08' }),
    item({ id: 'invoice:1', priority: 'completed' }),
  ].toSorted(compareOperationalWorkItems);

  assert.deepEqual(
    rows.map((row) => row.id),
    ['renewal:2', 'document:1', 'document:2', 'invoice:1'],
  );
});

test('calendar normalization distinguishes Dubai date-only deadlines from timestamps', () => {
  assert.deepEqual(
    normalizeCalendarEvent({
      id: 'renewal:1',
      domain: 'renewal',
      title: 'Trade licence renewal',
      timing: { kind: 'date', date: '2026-09-07', timeZone: 'Asia/Dubai' },
      status: { domain: 'renewal', value: 'due_soon' },
      priority: 'warning',
      target: { kind: 'unavailable', reason: 'Unavailable' },
    }).timing,
    { kind: 'date', date: '2026-09-07', timeZone: 'Asia/Dubai' },
  );

  assert.equal(
    normalizeCalendarEvent({
      id: 'meeting:1',
      domain: 'meeting',
      title: 'Consultation',
      timing: {
        kind: 'timestamp',
        startsAt: '2026-09-07T08:00:00.000Z',
        endsAt: '2026-09-07T08:30:00.000Z',
        timeZone: 'Asia/Dubai',
      },
      status: { domain: 'meeting', value: 'scheduled' },
      priority: 'active',
      target: { kind: 'unavailable', reason: 'Unavailable' },
    }).timing.kind,
    'timestamp',
  );
});

test('timeline normalization orders stably and strips unsafe detail keys', () => {
  const result = normalizeTimelineEvents([
    {
      id: 'b',
      domain: 'audit' as const,
      actor: { category: 'operator' as const, display: 'Platform operator' },
      action: 'Updated record',
      occurredAt: '2026-09-07T09:00:00.000Z',
      targetLabel: 'Company record',
      detail: { summary: 'Safe change', ip: '127.0.0.1', storagePath: 'private/file' },
      visibility: 'privileged' as const,
    },
    {
      id: 'a',
      domain: 'audit' as const,
      actor: { category: 'operator' as const },
      action: 'Created record',
      occurredAt: '2026-09-07T09:00:00.000Z',
      targetLabel: 'Company record',
      detail: { reason: 'Approved' },
      visibility: 'privileged' as const,
    },
  ]);

  assert.deepEqual(
    result.map((event) => event.id),
    ['a', 'b'],
  );
  assert.deepEqual(result[1]?.detail, { summary: 'Safe change' });
});

test('independent operational sources preserve partial success', async () => {
  const state = await settleOperationalSources({
    documents: Promise.resolve([1]),
    renewals: Promise.reject(new Error('private database detail')),
  });

  assert.equal(state.status, 'partial');
  if (state.status === 'partial') {
    assert.deepEqual(state.value, { documents: [1] });
    assert.deepEqual(state.unavailable, ['renewals']);
  }
  assert.doesNotMatch(JSON.stringify(state), /private database detail/u);
});
