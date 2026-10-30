import assert from 'node:assert/strict';
import test from 'node:test';
import { maskIdentifier, projectEmployeeForRole, type EmployeeRecord } from './privacy';

const record: EmployeeRecord = {
  id: '6a1f0000-0000-4000-8000-000000000001',
  version: 3,
  name: 'Alpha Person',
  email: 'alpha@example.invalid',
  phone: '+971500000000',
  nationality: 'IN',
  jobTitle: 'Engineer',
  status: 'active',
  passportLast4: '4567',
  visaLast4: '9911',
  emiratesIdLast4: '1234',
  visaExpiry: '2027-01-01',
  eidExpiry: '2027-01-01',
};

test('identifiers are masked to last four characters only', () => {
  assert.equal(maskIdentifier('4567'), '•••• 4567');
  assert.equal(maskIdentifier(null), null);
});

test('PRO and operator see masked identifiers with contact fields', () => {
  for (const role of ['pro', 'admin', 'super_admin'] as const) {
    const view = projectEmployeeForRole(role, record);
    assert.equal(view.passport, '•••• 4567');
    assert.equal(view.email, 'alpha@example.invalid');
    assert.equal(view.version, 3);
  }
});

test('customer sees status and expiries but no contact or identifier values', () => {
  const view = projectEmployeeForRole('customer', record);
  assert.equal(view.email, null);
  assert.equal(view.phone, null);
  assert.equal(view.passport, null);
  assert.equal(view.emiratesId, null);
  assert.equal(view.visaExpiry, '2027-01-01');
  assert.equal(JSON.stringify(view).includes('4567'), false);
});

test('employee self view keeps own masked identifiers; projection never returns raw fields', () => {
  const view = projectEmployeeForRole('employee_self', record);
  assert.equal(view.passport, '•••• 4567');
  assert.equal(view.phone, '+971500000000');
  const keys = Object.keys(view).sort();
  assert.equal(keys.includes('passportLast4'), false);
  assert.throws(
    () => projectEmployeeForRole('employee_other' as never, record),
    /ROLE_NOT_PROJECTED/u,
  );
});
