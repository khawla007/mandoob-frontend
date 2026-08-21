import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProAssignmentEligibility } from './pro-eligibility';

const CREDENTIAL_ID = '11111111-1111-4111-8111-111111111111';
const PRICING_ID = '22222222-2222-4222-8222-222222222222';
const COMPENSATION_ID = '33333333-3333-4333-8333-333333333333';

test('parses the exact sanitized eligibility result', () => {
  assert.deepEqual(
    parseProAssignmentEligibility({
      eligible: true,
      codes: [],
      verifiedCredentialId: CREDENTIAL_ID,
      pricingTermId: PRICING_ID,
      compensationTermId: COMPENSATION_ID,
    }),
    {
      eligible: true,
      codes: [],
      verifiedCredentialId: CREDENTIAL_ID,
      pricingTermId: PRICING_ID,
      compensationTermId: COMPENSATION_ID,
    },
  );
});

test('preserves deterministic eligibility code order and rejects unknown output', () => {
  const parsed = parseProAssignmentEligibility({
    eligible: false,
    codes: ['PRO_CREDENTIAL_EXPIRED', 'PRICING_TERMS_MISSING'],
    verifiedCredentialId: null,
    pricingTermId: null,
    compensationTermId: null,
  });
  assert.deepEqual(parsed.codes, ['PRO_CREDENTIAL_EXPIRED', 'PRICING_TERMS_MISSING']);
  for (const invalid of [
    { ...parsed, codes: ['PRIVATE_DATABASE_ERROR'] },
    { ...parsed, storagePath: 'private/path' },
    { ...parsed, eligible: 'yes' },
  ]) {
    assert.throws(() => parseProAssignmentEligibility(invalid), /eligibility/u);
  }
});
