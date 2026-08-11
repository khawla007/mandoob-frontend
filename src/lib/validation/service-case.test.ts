import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createServiceCaseSchema,
  serviceCaseFilterSchema,
  serviceCasePriorities,
  serviceCaseStatuses,
  updateServiceCaseSchema,
} from './service-case';

const clientId = '11111111-1111-4111-8111-111111111111';
const assigneeId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-08-11T10:00:00+05:30';

const validCreate = {
  client_id: clientId,
  title: '  Trade licence renewal  ',
  service_type: '  trade_license  ',
};

test('create schema accepts a valid case and applies defaults and trimming', () => {
  const parsed = createServiceCaseSchema.parse(validCreate);

  assert.equal(parsed.client_id, clientId);
  assert.equal(parsed.title, 'Trade licence renewal');
  assert.equal(parsed.service_type, 'trade_license');
  assert.equal(parsed.priority, 'normal');
});

test('create schema accepts optional nullable fields and offset datetimes', () => {
  const parsed = createServiceCaseSchema.parse({
    ...validCreate,
    priority: 'urgent',
    assigned_to: assigneeId,
    due_at: timestamp,
    sla_due_at: '2026-08-12T12:00:00Z',
    blocked_reason: '  Waiting for the signed lease  ',
  });

  assert.equal(parsed.priority, 'urgent');
  assert.equal(parsed.assigned_to, assigneeId);
  assert.equal(parsed.due_at, timestamp);
  assert.equal(parsed.sla_due_at, '2026-08-12T12:00:00Z');
  assert.equal(parsed.blocked_reason, 'Waiting for the signed lease');
  assert.equal(
    createServiceCaseSchema.parse({ ...validCreate, assigned_to: null }).assigned_to,
    null,
  );
});

test('create schema rejects missing required fields and invalid enum values', () => {
  for (const field of ['client_id', 'title', 'service_type']) {
    const input = { ...validCreate };
    delete input[field as keyof typeof input];
    assert.equal(createServiceCaseSchema.safeParse(input).success, false, field);
  }

  assert.equal(
    createServiceCaseSchema.safeParse({ ...validCreate, priority: 'critical' }).success,
    false,
  );
  assert.deepEqual(serviceCasePriorities, ['low', 'normal', 'high', 'urgent']);
  assert.deepEqual(serviceCaseStatuses, [
    'draft',
    'documents_pending',
    'ready_to_submit',
    'submitted',
    'authority_review',
    'approved',
    'completed',
    'cancelled',
  ]);
});

test('create schema enforces title, service type, and blocked reason length boundaries', () => {
  const cases = [
    ['title', 1, false],
    ['title', 2, true],
    ['title', 160, true],
    ['title', 161, false],
    ['service_type', 1, false],
    ['service_type', 2, true],
    ['service_type', 80, true],
    ['service_type', 81, false],
    ['blocked_reason', 1, false],
    ['blocked_reason', 2, true],
    ['blocked_reason', 500, true],
    ['blocked_reason', 501, false],
  ] as const;

  for (const [field, length, valid] of cases) {
    const input = { ...validCreate, [field]: 'x'.repeat(length) };
    assert.equal(createServiceCaseSchema.safeParse(input).success, valid, `${field}:${length}`);
  }
});

test('create schema rejects invalid UUIDs and datetimes', () => {
  assert.equal(
    createServiceCaseSchema.safeParse({ ...validCreate, client_id: 'not-a-uuid' }).success,
    false,
  );
  assert.equal(
    createServiceCaseSchema.safeParse({ ...validCreate, assigned_to: 'not-a-uuid' }).success,
    false,
  );
  assert.equal(
    createServiceCaseSchema.safeParse({ ...validCreate, due_at: '2026-02-30T10:00:00Z' }).success,
    false,
  );
  assert.equal(
    createServiceCaseSchema.safeParse({ ...validCreate, sla_due_at: '2026-08-11' }).success,
    false,
  );
});

test('update schema requires at least one field and rejects unknown keys', () => {
  assert.equal(updateServiceCaseSchema.safeParse({}).success, false);
  assert.equal(updateServiceCaseSchema.safeParse({ title: 'not-an-update-field' }).success, false);
  assert.equal(
    updateServiceCaseSchema.safeParse({ priority: 'high', unexpected: true }).success,
    false,
  );
});

test('update schema accepts each supported field with nullables and trimming', () => {
  const parsed = updateServiceCaseSchema.parse({
    status: 'authority_review',
    priority: 'high',
    assigned_to: null,
    due_at: timestamp,
    sla_due_at: null,
    blocked_reason: '  Waiting on authority  ',
    completed_at: null,
  });

  assert.equal(parsed.status, 'authority_review');
  assert.equal(parsed.assigned_to, null);
  assert.equal(parsed.due_at, timestamp);
  assert.equal(parsed.blocked_reason, 'Waiting on authority');
});

test('update schema enforces supported field length boundaries', () => {
  const cases = [
    ['blocked_reason', 1, false],
    ['blocked_reason', 2, true],
    ['blocked_reason', 500, true],
    ['blocked_reason', 501, false],
  ] as const;

  for (const [field, length, valid] of cases) {
    assert.equal(
      updateServiceCaseSchema.safeParse({ [field]: 'x'.repeat(length) }).success,
      valid,
      `${field}:${length}`,
    );
  }
});

test('update schema requires completed_at when status is completed', () => {
  assert.equal(updateServiceCaseSchema.safeParse({ status: 'completed' }).success, false);
  assert.equal(
    updateServiceCaseSchema.safeParse({ status: 'completed', completed_at: null }).success,
    false,
  );
  assert.equal(
    updateServiceCaseSchema.safeParse({ status: 'completed', completed_at: timestamp }).success,
    true,
  );
});

test('update schema rejects completed_at for an explicit non-completed status', () => {
  for (const status of serviceCaseStatuses.filter((status) => status !== 'completed')) {
    assert.equal(
      updateServiceCaseSchema.safeParse({ status, completed_at: timestamp }).success,
      false,
      status,
    );
    assert.equal(
      updateServiceCaseSchema.safeParse({ status, completed_at: null }).success,
      true,
      status,
    );
  }
});

test('update schema rejects invalid status, UUID, and datetime values', () => {
  assert.equal(updateServiceCaseSchema.safeParse({ status: 'unknown' }).success, false);
  assert.equal(updateServiceCaseSchema.safeParse({ assigned_to: 'not-a-uuid' }).success, false);
  assert.equal(updateServiceCaseSchema.safeParse({ completed_at: 'tomorrow' }).success, false);
});

test('filter schema accepts valid filters and deduplicates statuses', () => {
  assert.deepEqual(serviceCaseFilterSchema.parse({}), {});

  const parsed = serviceCaseFilterSchema.parse({
    status: ['draft', 'approved', 'draft'],
    assigned_to: assigneeId,
    client_id: clientId,
  });

  assert.deepEqual(parsed.status, ['draft', 'approved']);
  assert.equal(parsed.assigned_to, assigneeId);
  assert.equal(parsed.client_id, clientId);
});

test('filter schema allows up to eight statuses and rejects invalid values and extra keys', () => {
  const eightStatuses = [...serviceCaseStatuses];
  assert.equal(serviceCaseFilterSchema.safeParse({ status: eightStatuses }).success, true);
  assert.equal(
    serviceCaseFilterSchema.safeParse({ status: [...eightStatuses, 'draft'] }).success,
    false,
  );
  assert.equal(serviceCaseFilterSchema.safeParse({ status: ['unknown'] }).success, false);
  assert.equal(serviceCaseFilterSchema.safeParse({ assigned_to: 'not-a-uuid' }).success, false);
  assert.equal(serviceCaseFilterSchema.safeParse({ client_id: 'not-a-uuid' }).success, false);
  assert.equal(serviceCaseFilterSchema.safeParse({ unknown: true }).success, false);
});
