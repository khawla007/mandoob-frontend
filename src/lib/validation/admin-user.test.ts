import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUserSchema } from './admin-user';

const tenantId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const baseCommon = {
  full_name: 'Khawla Tester',
  email: 'k@example.com',
  phone: '+971501234567',
  tenant_id: tenantId,
};
const futureDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
})();
void futureDate;

describe('createUserSchema — happy paths', () => {
  it('accepts a minimal pro', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'pro',
      license_no: 'LIC-1',
      service_areas: ['DUBAI'],
    });
    assert.equal(r.success, true);
  });

  it('accepts a minimal customer', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'customer',
    });
    assert.equal(r.success, true);
  });

  it('accepts a minimal employee with client_id', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'employee',
      client_id: clientId,
    });
    assert.equal(r.success, true);
  });

  it('accepts an admin with no tenant_id and a reason', () => {
    const { tenant_id: _drop, ...common } = baseCommon;
    void _drop;
    const r = createUserSchema.safeParse({
      ...common,
      role: 'admin',
      reason: 'Promoting Aisha to admin per ticket OPS-42',
    });
    assert.equal(r.success, true);
  });
});

describe('createUserSchema — rejects', () => {
  it('rejects employee missing client_id', () => {
    const r = createUserSchema.safeParse({ ...baseCommon, role: 'employee' });
    assert.equal(r.success, false);
  });

  it('admin variant ignores tenant_id and parses without it', () => {
    const r = createUserSchema.safeParse({
      full_name: 'A',
      email: 'a@example.com',
      phone: '+971501234567',
      role: 'admin',
    });
    assert.equal(r.success, true);
  });

  it('rejects pro with >8 service_areas', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'pro',
      license_no: 'LIC-1',
      service_areas: [
        'DUBAI',
        'ABU_DHABI',
        'SHARJAH',
        'AJMAN',
        'UAQ',
        'RAK',
        'FUJAIRAH',
        'ALL_UAE',
        'DUBAI',
      ],
    });
    assert.equal(r.success, false);
  });

  it('rejects employee with past visa_expiry', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'employee',
      client_id: clientId,
      visa_expiry: '2000-01-01',
    });
    assert.equal(r.success, false);
  });

  it('rejects employee with malformed emirates_id', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'employee',
      client_id: clientId,
      emirates_id: '784-1234-12-9',
    });
    assert.equal(r.success, false);
  });

  it('rejects customer with 3-letter nationality', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'customer',
      nationality: 'ARE',
    });
    assert.equal(r.success, false);
  });

  it('rejects bad phone', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'pro',
      license_no: 'LIC-1',
      service_areas: ['DUBAI'],
      phone: '0501234567',
    });
    assert.equal(r.success, false);
  });

  it('rejects bad email', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'pro',
      license_no: 'LIC-1',
      service_areas: ['DUBAI'],
      email: 'not-an-email',
    });
    assert.equal(r.success, false);
  });
});

describe('createUserSchema — service area enum', () => {
  it('accepts ALL_UAE sentinel alone', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'pro',
      license_no: 'LIC-1',
      service_areas: ['ALL_UAE'],
    });
    assert.equal(r.success, true);
  });

  it('accepts pro with empty service_areas', () => {
    const r = createUserSchema.safeParse({
      ...baseCommon,
      role: 'pro',
      license_no: 'LIC-1',
      service_areas: [],
    });
    assert.equal(r.success, true);
  });
});
