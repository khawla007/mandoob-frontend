import assert from 'node:assert/strict';
import test from 'node:test';
import { companyAssignmentFormIdentity } from './company-assignment-form-identity';

test('assignment identity changes across assign and reassign transitions', () => {
  const unassigned = companyAssignmentFormIdentity(null);
  const assigned = companyAssignmentFormIdentity('assignment-1');
  const reassigned = companyAssignmentFormIdentity('assignment-2');

  assert.equal(unassigned, 'unassigned');
  assert.notEqual(assigned, unassigned);
  assert.notEqual(reassigned, assigned);
});
