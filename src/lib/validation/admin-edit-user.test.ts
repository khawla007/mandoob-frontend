import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { editUserSchema, changeRoleSchema, changeStatusSchema, mfaResetSchema } from './admin-user';

const tenantId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const editCommon = {
  full_name: 'Khawla Tester',
  phone: '+971501234567',
  tenant_id: tenantId,
};
const futureDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
})();

describe('editUserSchema — happy paths', () => {
  it('accepts pro edit (no email)', () => {
    const r = editUserSchema.safeParse({
      full_name: editCommon.full_name,
      phone: editCommon.phone,
      tenant_id: null,
      role: 'pro',
      service_areas: ['DUBAI'],
    });
    assert.equal(r.success, true);
  });

  it('accepts customer edit', () => {
    const r = editUserSchema.safeParse({ ...editCommon, role: 'customer' });
    assert.equal(r.success, true);
  });

  it('accepts employee edit with company_id', () => {
    const r = editUserSchema.safeParse({
      ...editCommon,
      role: 'employee',
      company_id: companyId,
    });
    assert.equal(r.success, true);
  });

  it('accepts admin edit (no tenant_id)', () => {
    const r = editUserSchema.safeParse({
      full_name: editCommon.full_name,
      phone: editCommon.phone,
      role: 'admin',
    });
    assert.equal(r.success, true);
  });
});

describe('editUserSchema — rejects', () => {
  it('rejects a PRO edit carrying a tenant assignment', () => {
    assert.equal(
      editUserSchema.safeParse({
        ...editCommon,
        role: 'pro',
        service_areas: ['DUBAI'],
      }).success,
      false,
    );
  });
  it('strips obsolete generic PRO licence input', () => {
    const r = editUserSchema.safeParse({
      full_name: editCommon.full_name,
      phone: editCommon.phone,
      tenant_id: null,
      role: 'pro',
      license_no: 'LIC-1',
      service_areas: ['DUBAI'],
    });
    assert.equal(r.success, true);
    if (r.success) assert.equal('license_no' in r.data, false);
  });
  it('rejects employee missing company_id', () => {
    const r = editUserSchema.safeParse({ ...editCommon, role: 'employee' });
    assert.equal(r.success, false);
  });

  it('strips email when provided (immutable on edit)', () => {
    // The editBaseFields type does not include email. Zod strips unknown keys
    // by default for object schemas; this assertion just ensures parse still
    // succeeds and that email is not in the parsed output.
    const r = editUserSchema.safeParse({
      full_name: editCommon.full_name,
      phone: editCommon.phone,
      tenant_id: null,
      email: 'should-be-stripped@example.com',
      role: 'pro',
      service_areas: ['DUBAI'],
    });
    assert.equal(r.success, true);
    if (r.success) assert.equal('email' in r.data, false);
  });

  it('rejects employee with past visa_expiry', () => {
    const r = editUserSchema.safeParse({
      ...editCommon,
      role: 'employee',
      company_id: companyId,
      visa_expiry: '2000-01-01',
    });
    assert.equal(r.success, false);
  });
});

describe('changeRoleSchema — happy paths', () => {
  it('accepts pro newRole with required fields', () => {
    const r = changeRoleSchema.safeParse({
      newRole: 'pro',
      tenant_id: null,
      service_areas: ['DUBAI'],
    });
    assert.equal(r.success, true);
  });

  it('accepts admin newRole with reason and confirmation', () => {
    const r = changeRoleSchema.safeParse({
      newRole: 'admin',
      reason: 'Promotion for OPS-99',
      confirmation: 'DEMOTE',
    });
    assert.equal(r.success, true);
  });

  it('accepts employee newRole with company_id and visa_expiry', () => {
    const r = changeRoleSchema.safeParse({
      newRole: 'employee',
      tenant_id: tenantId,
      company_id: companyId,
      visa_expiry: futureDate,
    });
    assert.equal(r.success, true);
  });

  it('accepts customer newRole minimal', () => {
    const r = changeRoleSchema.safeParse({
      newRole: 'customer',
      tenant_id: tenantId,
    });
    assert.equal(r.success, true);
  });
});

describe('changeRoleSchema — rejects', () => {
  it('rejects super_admin newRole (not in discriminator)', () => {
    const r = changeRoleSchema.safeParse({
      newRole: 'super_admin',
      tenant_id: tenantId,
    });
    assert.equal(r.success, false);
  });

  it('accepts pro newRole with omitted tenant_id as unassigned', () => {
    const r = changeRoleSchema.safeParse({
      newRole: 'pro',
      service_areas: ['DUBAI'],
    });
    assert.equal(r.success, true);
    assert.equal(r.success && r.data.tenant_id, null);
  });

  it('accepts pro newRole without generic licence data', () => {
    const r = changeRoleSchema.safeParse({
      newRole: 'pro',
      tenant_id: null,
      service_areas: ['DUBAI'],
    });
    assert.equal(r.success, true);
  });

  it('rejects pro newRole carrying a tenant assignment', () => {
    assert.equal(
      changeRoleSchema.safeParse({
        newRole: 'pro',
        tenant_id: tenantId,
        service_areas: ['DUBAI'],
      }).success,
      false,
    );
  });

  it('rejects employee newRole missing company_id', () => {
    const r = changeRoleSchema.safeParse({
      newRole: 'employee',
      tenant_id: tenantId,
    });
    assert.equal(r.success, false);
  });

  it('rejects confirmation other than DEMOTE', () => {
    const r = changeRoleSchema.safeParse({
      newRole: 'pro',
      tenant_id: tenantId,
      service_areas: ['DUBAI'],
      confirmation: 'CONFIRM',
    });
    assert.equal(r.success, false);
  });
});

describe('changeStatusSchema — happy paths', () => {
  it('accepts active', () => {
    const r = changeStatusSchema.safeParse({ newStatus: 'active' });
    assert.equal(r.success, true);
  });

  it('accepts suspended with reason', () => {
    const r = changeStatusSchema.safeParse({
      newStatus: 'suspended',
      reason: 'Investigating bank-detail tampering',
    });
    assert.equal(r.success, true);
  });

  it('accepts disabled with no reason', () => {
    const r = changeStatusSchema.safeParse({ newStatus: 'disabled' });
    assert.equal(r.success, true);
  });

  it('accepts disabled with reason', () => {
    const r = changeStatusSchema.safeParse({
      newStatus: 'disabled',
      reason: 'Offboarding',
    });
    assert.equal(r.success, true);
  });
});

describe('changeStatusSchema — rejects', () => {
  it('rejects suspended without reason', () => {
    const r = changeStatusSchema.safeParse({ newStatus: 'suspended' });
    assert.equal(r.success, false);
  });

  it('rejects suspended with empty reason', () => {
    const r = changeStatusSchema.safeParse({
      newStatus: 'suspended',
      reason: '',
    });
    assert.equal(r.success, false);
  });

  it('rejects unknown status', () => {
    const r = changeStatusSchema.safeParse({ newStatus: 'invited' });
    assert.equal(r.success, false);
  });

  it('rejects reason >500 chars on disabled', () => {
    const r = changeStatusSchema.safeParse({
      newStatus: 'disabled',
      reason: 'x'.repeat(501),
    });
    assert.equal(r.success, false);
  });
});

describe('mfaResetSchema', () => {
  it('accepts empty body', () => {
    const r = mfaResetSchema.safeParse({});
    assert.equal(r.success, true);
  });

  it('accepts with reason', () => {
    const r = mfaResetSchema.safeParse({ reason: 'Lost device' });
    assert.equal(r.success, true);
  });

  it('rejects reason >500 chars', () => {
    const r = mfaResetSchema.safeParse({ reason: 'x'.repeat(501) });
    assert.equal(r.success, false);
  });
});
