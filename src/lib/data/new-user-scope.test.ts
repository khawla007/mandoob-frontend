import assert from 'node:assert/strict';
import test from 'node:test';

import { tenantScopeForNewUser } from './new-user-scope';

const tenantId = '11111111-1111-4111-8111-111111111111';

test('new PRO and platform admin users begin unassigned', () => {
  assert.equal(tenantScopeForNewUser({ role: 'pro', tenant_id: null }), null);
  assert.equal(tenantScopeForNewUser({ role: 'admin', tenant_id: null }), null);
});

test('customer and employee users retain their required company tenant scope', () => {
  assert.equal(tenantScopeForNewUser({ role: 'customer', tenant_id: tenantId }), tenantId);
  assert.equal(tenantScopeForNewUser({ role: 'employee', tenant_id: tenantId }), tenantId);
});
