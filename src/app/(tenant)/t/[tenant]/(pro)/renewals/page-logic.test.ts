import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRenewalTab } from './page-logic';

test('renewal action tab contract consumes active and normalizes unsupported values', () => {
  assert.equal(parseRenewalTab('active'), 'active');
  assert.equal(parseRenewalTab('completed'), 'completed');
  assert.equal(parseRenewalTab('cancelled'), 'cancelled');
  assert.equal(parseRenewalTab('renewal-id'), 'active');
  assert.equal(parseRenewalTab(undefined), 'active');
});
