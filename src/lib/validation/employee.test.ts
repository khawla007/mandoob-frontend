import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmployeeSchema,
  employeeSelfUpdateSchema,
  setEmployeeStatusSchema,
  updateEmployeeSchema,
} from './employee';

const op = '22222222-2222-4222-8222-222222222222';
const id = '11111111-1111-4111-8111-111111111111';

test('create requires an operation id and a name; unknown fields are rejected', () => {
  assert.equal(createEmployeeSchema.safeParse({ operation_id: op, name: 'Alpha' }).success, true);
  assert.equal(createEmployeeSchema.safeParse({ name: 'Alpha' }).success, false);
  assert.equal(createEmployeeSchema.safeParse({ operation_id: op, name: '' }).success, false);
  assert.equal(
    createEmployeeSchema.safeParse({ operation_id: op, name: 'Alpha', company_id: id }).success,
    false,
  );
  assert.equal(
    createEmployeeSchema.safeParse({ operation_id: op, name: 'Alpha', emirates_id: '784-1' })
      .success,
    false,
  );
});

test('update is versioned and non-empty; status is limited to active/inactive', () => {
  assert.equal(
    updateEmployeeSchema.safeParse({
      operation_id: op,
      employee_id: id,
      expected_version: 2,
      patch: { job_title: 'Lead' },
    }).success,
    true,
  );
  assert.equal(
    updateEmployeeSchema.safeParse({
      operation_id: op,
      employee_id: id,
      expected_version: 2,
      patch: {},
    }).success,
    false,
  );
  assert.equal(
    setEmployeeStatusSchema.safeParse({
      operation_id: op,
      employee_id: id,
      expected_version: 1,
      status: 'terminated',
    }).success,
    false,
  );
});

test('self update only allows phone and reminder preference', () => {
  assert.equal(
    employeeSelfUpdateSchema.safeParse({
      operation_id: op,
      expected_version: 1,
      renewal_reminders_enabled: false,
    }).success,
    true,
  );
  assert.equal(
    employeeSelfUpdateSchema.safeParse({ operation_id: op, expected_version: 1, name: 'X' })
      .success,
    false,
  );
  assert.equal(
    employeeSelfUpdateSchema.safeParse({ operation_id: op, expected_version: 1 }).success,
    false,
  );
});
