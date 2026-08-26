import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRO_ASSIGNMENT_ELIGIBILITY_CODES,
  PRO_CREDENTIAL_EVENTS,
  PRO_CREDENTIAL_STATES,
  PRO_TERM_KINDS,
  PRO_TERM_MODELS,
  isProCredentialTransitionAllowed,
  isProCredentialUnexpiredAtDubaiDate,
  maskProCredentialIdentifier,
} from './contracts';

test('exports the exact credential lifecycle and commercial term unions', () => {
  assert.deepEqual(PRO_CREDENTIAL_STATES, [
    'draft',
    'submitted',
    'under_review',
    'verified',
    'rejected',
    'expired',
    'revoked',
  ]);
  assert.deepEqual(PRO_CREDENTIAL_EVENTS, [
    'submitted',
    'review_started',
    'verified',
    'rejected',
    'expired',
    'revoked',
    'superseded',
  ]);
  assert.deepEqual(PRO_TERM_KINDS, ['pricing', 'compensation']);
  assert.deepEqual(PRO_TERM_MODELS, ['per_registration', 'retainer']);
});

test('keeps eligibility codes in the public deterministic order', () => {
  assert.deepEqual(PRO_ASSIGNMENT_ELIGIBILITY_CODES, [
    'PRO_ACCOUNT_INACTIVE',
    'PRO_CREDENTIAL_MISSING',
    'PRO_CREDENTIAL_DRAFT',
    'PRO_CREDENTIAL_SUBMITTED',
    'PRO_CREDENTIAL_UNDER_REVIEW',
    'PRO_CREDENTIAL_REJECTED',
    'PRO_CREDENTIAL_EXPIRED',
    'PRO_CREDENTIAL_REVOKED',
    'PRO_ALREADY_ASSIGNED',
    'PRICING_TERMS_MISSING',
    'COMPENSATION_TERMS_MISSING',
    'COMPANY_INACTIVE',
    'COMPANY_ALREADY_ASSIGNED',
  ]);
});

test('allows only lifecycle transitions approved by the plan', () => {
  const allowed = [
    ['draft', 'submitted'],
    ['submitted', 'under_review'],
    ['under_review', 'verified'],
    ['under_review', 'rejected'],
    ['verified', 'expired'],
    ['verified', 'revoked'],
  ] as const;
  for (const [from, to] of allowed) {
    assert.equal(isProCredentialTransitionAllowed(from, to), true, `${from} -> ${to}`);
  }
  for (const [from, to] of [
    ['draft', 'verified'],
    ['submitted', 'rejected'],
    ['verified', 'draft'],
    ['rejected', 'submitted'],
    ['expired', 'verified'],
    ['revoked', 'verified'],
  ] as const) {
    assert.equal(isProCredentialTransitionAllowed(from, to), false, `${from} -> ${to}`);
  }
});

test('presents only a last-four typed mask', () => {
  assert.equal(maskProCredentialIdentifier('1234'), '•••• 1234');
  assert.equal(maskProCredentialIdentifier(null), null);
  assert.throws(() => maskProCredentialIdentifier('12345'), /last four/u);
});

test('treats expiry as inclusive at the Dubai business-date boundary', () => {
  assert.equal(
    isProCredentialUnexpiredAtDubaiDate('2026-08-21', new Date('2026-08-21T19:59:59.999Z')),
    true,
  );
  assert.equal(
    isProCredentialUnexpiredAtDubaiDate('2026-08-21', new Date('2026-08-21T20:00:00.000Z')),
    false,
  );
});
