import assert from 'node:assert/strict';
import test from 'node:test';

test('expiry state admits one mutation at a time and applies only successful submitted values', async () => {
  let loaded: typeof import('./expiry-state') | undefined;
  try {
    loaded = await import('./expiry-state');
  } catch {}
  assert.ok(loaded);
  if (!loaded) return;

  const initial = loaded.createExpiryState('2027-08-31');
  const set = loaded.beginExpirySubmission(initial, '2028-01-15');
  assert.equal(set.accepted, true);
  assert.equal(set.state.pending, true);

  const competingClear = loaded.beginExpirySubmission(set.state, '');
  assert.equal(competingClear.accepted, false);
  assert.equal(competingClear.state, set.state);

  const setSuccess = loaded.settleExpirySubmission(set.state, true);
  assert.deepEqual(setSuccess, { value: '2028-01-15', pending: false, submittedValue: null });

  const clear = loaded.beginExpirySubmission(setSuccess, '');
  assert.equal(clear.accepted, true);
  const clearSuccess = loaded.settleExpirySubmission(clear.state, true);
  assert.equal(clearSuccess.value, '');

  const failed = loaded.beginExpirySubmission(clearSuccess, '2029-03-01');
  assert.equal(loaded.settleExpirySubmission(failed.state, false).value, '');
});

test('expiry state synchronizes a new server-owned prop when idle', async () => {
  const { createExpiryState, syncExpiryProp } = await import('./expiry-state');
  assert.equal(syncExpiryProp(createExpiryState('2027-01-01'), '2027-06-30').value, '2027-06-30');
});
