import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeVisibleCompanies } from './company-summaries';

test('summarizes only the visible page and preserves zero counts', () => {
  assert.deepEqual(
    summarizeVisibleCompanies([
      { currentProName: 'PRO One', companyStatus: 'active' },
      { currentProName: null, companyStatus: 'onboarding' },
      { currentProName: null, companyStatus: 'renewal_overdue' },
    ]),
    { visible: 3, assigned: 1, unassigned: 2, lifecycleAttention: 2 },
  );
  assert.deepEqual(summarizeVisibleCompanies([]), {
    visible: 0,
    assigned: 0,
    unassigned: 0,
    lifecycleAttention: 0,
  });
});
