import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClientSchema } from './client';

test('createClientSchema accepts a minimal company name', () => {
  const r = createClientSchema.safeParse({ company_name: 'Acme Trading LLC' });
  assert.equal(r.success, true);
});

test('createClientSchema rejects an empty name', () => {
  const r = createClientSchema.safeParse({ company_name: '' });
  assert.equal(r.success, false);
});

test('createClientSchema accepts ISO date for license_expiry', () => {
  const r = createClientSchema.safeParse({
    company_name: 'Acme',
    license_expiry: '2027-12-31',
  });
  assert.equal(r.success, true);
});

test('createClientSchema rejects malformed license_expiry', () => {
  const r = createClientSchema.safeParse({
    company_name: 'Acme',
    license_expiry: '31/12/2027',
  });
  assert.equal(r.success, false);
});

test('createClientSchema treats empty optional strings as ok', () => {
  const r = createClientSchema.safeParse({
    company_name: 'Acme',
    trade_license_no: '',
    jurisdiction: '',
    license_expiry: '',
  });
  assert.equal(r.success, true);
});
