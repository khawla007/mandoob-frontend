import assert from 'node:assert/strict';
import test from 'node:test';

import { claimFormSubmission, releaseFormSubmission } from './form-submission-guard';

test('a form submission latch rejects a same-tick duplicate until released', () => {
  const latch = { current: false };
  assert.equal(claimFormSubmission(latch), true);
  assert.equal(claimFormSubmission(latch), false);
  releaseFormSubmission(latch);
  assert.equal(claimFormSubmission(latch), true);
});
