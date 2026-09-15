import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionProfile } from './require-user';

const tenantId = '00000000-0000-0000-0000-000000000001';

function actor(role: SessionProfile['role'], assignedTenant: string | null): SessionProfile {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    email: null,
    role,
    tenantId: assignedTenant,
    aal: 'aal2',
    mfaEnrolled: true,
  };
}

test('PRO invitations are bound to the one authoritative assignment', async () => {
  const { resolveInviteTenant } = await import('./invite-authorization');
  assert.equal(resolveInviteTenant(actor('pro', tenantId), null, 'customer'), tenantId);
  assert.equal(resolveInviteTenant(actor('pro', tenantId), tenantId, 'employee'), tenantId);
  assert.equal(
    resolveInviteTenant(actor('pro', tenantId), '00000000-0000-0000-0000-000000000003', 'customer'),
    null,
  );
  assert.equal(resolveInviteTenant(actor('pro', tenantId), tenantId, 'pro'), null);
  assert.equal(resolveInviteTenant(actor('pro', null), tenantId, 'customer'), null);
});

test('platform operators may select only a valid tenant identifier', async () => {
  const { resolveInviteTenant } = await import('./invite-authorization');
  for (const role of ['admin', 'super_admin'] as const) {
    assert.equal(resolveInviteTenant(actor(role, null), tenantId, 'pro'), tenantId);
    assert.equal(resolveInviteTenant(actor(role, null), 'not-a-uuid', 'customer'), null);
    assert.equal(resolveInviteTenant(actor(role, tenantId), tenantId, 'customer'), null);
  }
});

test('customer and employee identities cannot create invitations', async () => {
  const { resolveInviteTenant } = await import('./invite-authorization');
  for (const role of ['customer', 'employee'] as const) {
    assert.equal(resolveInviteTenant(actor(role, tenantId), tenantId, 'employee'), null);
  }
});
