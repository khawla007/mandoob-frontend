import assert from 'node:assert/strict';
import test from 'node:test';
import { mapP308Error, payloadHash } from './operation';

test('payload hash is canonical across key order and distinguishes changed payloads', () => {
  const a = payloadHash({ b: 1, a: { d: [1, 2], c: 'x' } });
  const b = payloadHash({ a: { c: 'x', d: [1, 2] }, b: 1 });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/u);
  assert.notEqual(a, payloadHash({ a: { c: 'y', d: [1, 2] }, b: 1 }));
  assert.equal(payloadHash({ a: undefined, b: null }), payloadHash({ b: null }));
});

test('database domain errors map to stable non-disclosing codes', () => {
  assert.deepEqual(mapP308Error({ code: 'P0001', message: 'STALE_VERSION' }), {
    code: 'STALE_VERSION',
    status: 409,
  });
  assert.deepEqual(mapP308Error({ code: '42501', message: 'FORBIDDEN' }), {
    code: 'FORBIDDEN',
    status: 403,
  });
  assert.deepEqual(mapP308Error({ code: '22023', message: 'INVALID_EMPLOYEE_PAYLOAD' }), {
    code: 'VALIDATION_FAILED',
    status: 400,
  });
  assert.equal(mapP308Error({ code: 'P0001', message: 'RENEWAL_EVIDENCE_REQUIRED' }).status, 422);
  assert.equal(mapP308Error({ code: 'P0001', message: 'EMPLOYEE_NOT_FOUND' }).status, 404);
  assert.equal(mapP308Error({ code: 'P0001', message: 'IMPORT_DUPLICATE_ARTIFACT' }).status, 409);
  // Unknown or raw driver errors never leak their text.
  assert.deepEqual(mapP308Error({ code: 'XX000', message: 'relation secret does not exist' }), {
    code: 'INTERNAL',
    status: 500,
  });
  assert.deepEqual(mapP308Error(new Error('boom')), { code: 'INTERNAL', status: 500 });
});
