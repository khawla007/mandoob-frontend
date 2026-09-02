import assert from 'node:assert/strict';
import test from 'node:test';
import { employeeRegistryDisplayState } from './employee-registry-display';
import type { EmployeeRegistryResult } from './pro-employee-registry';

function result(state: EmployeeRegistryResult['state']): EmployeeRegistryResult {
  return {
    state,
    rows: [],
    total: state === 'empty' ? 0 : 1,
    unfilteredTotal: state === 'empty' ? 0 : 2,
    page: 1,
    pageSize: 25,
    canonicalPage: 1,
    phase3Unavailable: true,
    ...(state === 'unavailable' ? { error: 'sanitized' as const } : {}),
  } as EmployeeRegistryResult;
}

test('registry resolves rendered empty, no-results, partial, and sanitized unavailable states', () => {
  assert.equal(employeeRegistryDisplayState(result('empty')), 'empty');
  assert.equal(employeeRegistryDisplayState(result('no_results')), 'no_results');
  assert.equal(employeeRegistryDisplayState(result('partial')), 'partial');
  assert.equal(employeeRegistryDisplayState(result('unavailable')), 'unavailable');
});
