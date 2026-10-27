import assert from 'node:assert/strict';
import test from 'node:test';

import { mapRegistrationWorkflowError } from './registration-workflow-errors';

test('maps forbidden by message and by sqlstate', () => {
  assert.deepEqual(mapRegistrationWorkflowError({ message: 'FORBIDDEN' }), {
    error: 'Not authorized for this registration action',
    code: 'FORBIDDEN',
    status: 403,
  });
  assert.equal(mapRegistrationWorkflowError({ code: '42501' }).status, 403);
});

test('maps not-found domain codes to 404', () => {
  for (const message of [
    'REGISTRATION_NOT_FOUND',
    'STAGE_NOT_FOUND',
    'DOCUMENT_LINK_NOT_FOUND',
    'VISA_PERSON_NOT_FOUND',
    'VISA_SOURCE_NOT_FOUND',
  ]) {
    const mapped = mapRegistrationWorkflowError({ message });
    assert.equal(mapped.status, 404, message);
    assert.equal(mapped.code, message);
  }
});

test('maps concurrency/idempotency/terminal conflicts to 409', () => {
  for (const message of [
    'OPERATION_REUSED',
    'STALE_REGISTRATION_VERSION',
    'STALE_STAGE_VERSION',
    'STALE_VISA_VERSION',
    'ACTIVE_REGISTRATION_EXISTS',
    'VISA_PERSON_EXISTS',
    'DOCUMENT_ALREADY_LINKED',
    'REGISTRATION_TERMINAL',
    'STAGE_ALREADY_TERMINAL',
    'VISA_PERSON_TERMINAL',
    'REGISTRATION_NOT_ACTIVE',
    'REGISTRATION_EVENT_IMMUTABLE',
    'COMPLETED_STAGE_EVIDENCE_IMMUTABLE',
  ]) {
    const mapped = mapRegistrationWorkflowError({ message });
    assert.equal(mapped.status, 409, message);
    assert.equal(mapped.code, message);
  }
  // raw unique_violation sqlstate
  assert.deepEqual(mapRegistrationWorkflowError({ code: '23505' }), {
    error: 'Registration action conflicts with current state',
    code: 'CONFLICT',
    status: 409,
  });
});

test('maps workflow business-rule violations to 422', () => {
  for (const message of [
    'INVALID_STAGE_TRANSITION',
    'STAGE_SKIP_FORBIDDEN',
    'STAGE_REQUIREMENTS_INCOMPLETE',
    'ILLEGAL_STAGE_ORDER',
    'REGISTRATION_COMPLETION_BLOCKED',
    'VISA_STAGE_INACTIVE',
    'INVALID_VISA_TRANSITION',
    'ILLEGAL_VISA_STAGE_ORDER',
    'VISA_COMPLETION_BLOCKED',
    'DOCUMENT_VERSION_NOT_APPROVED',
    'DOCUMENT_ROLE_FORBIDDEN',
    'COMPANY_INACTIVE',
  ]) {
    const mapped = mapRegistrationWorkflowError({ message });
    assert.equal(mapped.status, 422, message);
    assert.equal(mapped.code, message);
  }
});

test('maps input codes to 400 and 22023 fallback to 400', () => {
  const mapped = mapRegistrationWorkflowError({ message: 'INVALID_STAGE_DETAILS' });
  assert.equal(mapped.status, 400);
  assert.equal(mapped.code, 'INVALID_STAGE_DETAILS');
  assert.equal(mapRegistrationWorkflowError({ code: '22023' }).status, 400);
});

test('unknown errors and null fall back to internal 500', () => {
  assert.deepEqual(mapRegistrationWorkflowError(null), {
    error: 'Unable to complete registration action',
    code: 'INTERNAL',
    status: 500,
  });
  assert.equal(mapRegistrationWorkflowError({ message: 'SOMETHING_ELSE' }).status, 500);
});
