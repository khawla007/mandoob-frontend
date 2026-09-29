import assert from 'node:assert/strict';
import test from 'node:test';
import { identifierLast4, sealEmployeeIdentifiers } from './identifiers';

const deps = {
  encrypt: (value: string) => `enc(${value})`,
  hashPassport: (companyId: string, value: string) => `${companyId}:${value}`.padEnd(64, '0'),
};

test('last4 is derived from normalized alphanumerics', () => {
  assert.equal(identifierLast4('passport', ' p12-34567 '), '4567');
  assert.equal(identifierLast4('emirates_id', '784-1990-1234567-1'), '5671');
  assert.equal(identifierLast4('visa', 'ab'), 'AB');
  assert.equal(identifierLast4('visa', ''), null);
});

test('sealing emits ciphertext, lookup hash and last4 triples only for supplied identifiers', () => {
  const sealed = sealEmployeeIdentifiers(
    'company',
    { passport_no: ' p1234567 ', emirates_id: '784-1990-1234567-1' },
    deps,
  );
  assert.deepEqual(sealed, {
    passport_no_encrypted: 'enc(P1234567)',
    passport_no_hash: 'company:P1234567'.padEnd(64, '0'),
    passport_no_last4: '4567',
    emirates_id_encrypted: 'enc(784-1990-1234567-1)',
    emirates_id_last4: '5671',
  });
  assert.equal(JSON.stringify(sealed).includes('"P1234567"'), false);
});

test('explicit empty identifiers clear the stored triple', () => {
  assert.deepEqual(sealEmployeeIdentifiers('company', { visa_no: '' }, deps), {
    visa_no_encrypted: null,
    visa_no_last4: null,
  });
  assert.deepEqual(sealEmployeeIdentifiers('company', { passport_no: '' }, deps), {
    passport_no_encrypted: null,
    passport_no_hash: null,
    passport_no_last4: null,
  });
});
