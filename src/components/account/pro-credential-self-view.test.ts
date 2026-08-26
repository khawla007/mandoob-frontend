import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProCredentialSelfView,
  createProCredentialSelfDraftSchema,
  formatProEvidenceCreatedDate,
  formatProEvidenceMime,
  formatProEvidenceRemovalConfirmation,
} from './pro-credential-self-view';
import {
  claimFormSubmission,
  releaseFormSubmission,
} from '@/components/admin/form-submission-guard';
import type { ProCredentialMask } from '@/lib/data/pro-credentials';

const base: ProCredentialMask = {
  credentialId: '11111111-1111-4111-8111-111111111111',
  type: 'pro_license',
  maskedIdentifier: '•••• 1234',
  issuingAuthority: 'DET',
  issueDate: '2026-01-01',
  expiryDate: '2027-01-01',
  state: 'draft',
  version: 1,
  evidenceCount: 1,
  submittedAt: null,
  supersedesCredentialId: null,
};

test('self-view executes the complete credential state/action matrix', () => {
  assert.deepEqual(buildProCredentialSelfView(null), {
    create: true,
    edit: false,
    evidenceMutations: false,
    submit: false,
    replacement: false,
    readOnly: false,
  });
  for (const [state, expected] of [
    ['draft', [true, true, true, false, false]],
    ['submitted', [false, false, false, false, true]],
    ['under_review', [false, false, false, false, true]],
    ['verified', [false, false, false, false, true]],
    ['rejected', [false, false, false, true, true]],
    ['expired', [false, false, false, true, true]],
    ['revoked', [false, false, false, true, true]],
  ] as const) {
    const view = buildProCredentialSelfView({ ...base, state });
    assert.deepEqual(
      [view.edit, view.evidenceMutations, view.submit, view.replacement, view.readOnly],
      expected,
      state,
    );
  }
});

test('client requires a new identifier but permits blank preservation for a masked draft', () => {
  const input = {
    identifier: '',
    issuingAuthority: 'DET',
    issueDate: '2026-01-01',
    expiryDate: '2027-01-01',
    expectedVersion: 1,
    operationId: '22222222-2222-4222-8222-222222222222',
  };
  assert.equal(createProCredentialSelfDraftSchema(false).safeParse(input).success, false);
  assert.equal(createProCredentialSelfDraftSchema(true).safeParse(input).success, true);
});

test('read-only evidence metadata uses explicit locale, localized MIME and LTR-safe date output', () => {
  assert.equal(
    formatProEvidenceMime('application/pdf', (key) => key),
    'mime.pdf',
  );
  assert.equal(
    formatProEvidenceMime('image/jpeg', (key) => key),
    'mime.jpeg',
  );
  assert.equal(
    formatProEvidenceMime('image/png', (key) => key),
    'mime.png',
  );
  assert.equal(
    formatProEvidenceCreatedDate('2026-08-20T22:30:00.000Z', 'en'),
    new Intl.DateTimeFormat('en-AE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Dubai',
    }).format(new Date('2026-08-20T22:30:00.000Z')),
  );
});

test('evidence removal confirmation names the exact safe filename and duplicate submit is latched', () => {
  assert.equal(
    formatProEvidenceRemovalConfirmation(
      'licence-front.pdf',
      (_key, values) => `Remove ${values.filename}`,
    ),
    'Remove licence-front.pdf',
  );
  const latch = { current: false };
  assert.equal(claimFormSubmission(latch), true);
  assert.equal(claimFormSubmission(latch), false);
  releaseFormSubmission(latch);
  assert.equal(claimFormSubmission(latch), true);
});
