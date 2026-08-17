import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignCompanyProSchema,
  reassignCompanyProSchema,
  releaseCompanyProSchema,
} from './company-assignment';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const PRO_PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const ASSIGNMENT_ID = '33333333-3333-4333-8333-333333333333';

test('assignment accepts UUID identifiers', () => {
  const result = assignCompanyProSchema.safeParse({
    companyId: COMPANY_ID,
    proProfileId: PRO_PROFILE_ID,
  });

  assert.equal(result.success, true);
});

test('assignment rejects malformed, null, and non-string identifiers', () => {
  for (const invalidId of ['not-a-uuid', null, 42]) {
    assert.equal(
      assignCompanyProSchema.safeParse({
        companyId: invalidId,
        proProfileId: PRO_PROFILE_ID,
      }).success,
      false,
    );
    assert.equal(
      assignCompanyProSchema.safeParse({
        companyId: COMPANY_ID,
        proProfileId: invalidId,
      }).success,
      false,
    );
  }
});

test('assignment schemas reject unknown fields', () => {
  const inputs = [
    [
      assignCompanyProSchema,
      {
        companyId: COMPANY_ID,
        proProfileId: PRO_PROFILE_ID,
      },
    ],
    [
      releaseCompanyProSchema,
      {
        companyId: COMPANY_ID,
        assignmentId: ASSIGNMENT_ID,
        reason: 'Contract ended',
      },
    ],
    [
      reassignCompanyProSchema,
      {
        companyId: COMPANY_ID,
        assignmentId: ASSIGNMENT_ID,
        replacementProProfileId: PRO_PROFILE_ID,
        reason: 'Credential handover',
      },
    ],
  ] as const;

  for (const [schema, input] of inputs) {
    assert.equal(schema.safeParse({ ...input, tenantId: COMPANY_ID }).success, false);
  }
});

test('release trims a valid reason', () => {
  const result = releaseCompanyProSchema.safeParse({
    companyId: COMPANY_ID,
    assignmentId: ASSIGNMENT_ID,
    reason: '  Contract ended  ',
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.reason, 'Contract ended');
});

test('release enforces reason length after trimming', () => {
  for (const reason of ['no', ' '.repeat(4), `  ${'x'.repeat(501)}  `]) {
    assert.equal(
      releaseCompanyProSchema.safeParse({
        companyId: COMPANY_ID,
        assignmentId: ASSIGNMENT_ID,
        reason,
      }).success,
      false,
    );
  }

  for (const reason of ['yes', 'x'.repeat(500)]) {
    assert.equal(
      releaseCompanyProSchema.safeParse({
        companyId: COMPANY_ID,
        assignmentId: ASSIGNMENT_ID,
        reason,
      }).success,
      true,
    );
  }
});

test('reason length matches PostgreSQL char_length for astral characters', () => {
  const releaseInput = {
    companyId: COMPANY_ID,
    assignmentId: ASSIGNMENT_ID,
  };

  for (const reason of ['😀😀', '😀x']) {
    assert.equal(releaseCompanyProSchema.safeParse({ ...releaseInput, reason }).success, false);
  }

  assert.equal(
    releaseCompanyProSchema.safeParse({ ...releaseInput, reason: '  😀😀😀  ' }).success,
    true,
  );
  assert.equal(
    releaseCompanyProSchema.safeParse({ ...releaseInput, reason: '😀'.repeat(500) }).success,
    true,
  );
  assert.equal(
    releaseCompanyProSchema.safeParse({ ...releaseInput, reason: '😀'.repeat(501) }).success,
    false,
  );
});

test('release rejects malformed identifiers and non-string reasons', () => {
  const valid = {
    companyId: COMPANY_ID,
    assignmentId: ASSIGNMENT_ID,
    reason: 'Contract ended',
  };

  for (const field of ['companyId', 'assignmentId'] as const) {
    for (const invalidId of ['bad', null, 123]) {
      assert.equal(
        releaseCompanyProSchema.safeParse({ ...valid, [field]: invalidId }).success,
        false,
      );
    }
  }

  for (const reason of [null, 123]) {
    assert.equal(releaseCompanyProSchema.safeParse({ ...valid, reason }).success, false);
  }
});

test('reassignment accepts replacement PRO input and trims its reason', () => {
  const result = reassignCompanyProSchema.safeParse({
    companyId: COMPANY_ID,
    assignmentId: ASSIGNMENT_ID,
    replacementProProfileId: PRO_PROFILE_ID,
    reason: '  Credential handover  ',
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.reason, 'Credential handover');
});

test('reassignment validates every identifier and reason boundary', () => {
  const valid = {
    companyId: COMPANY_ID,
    assignmentId: ASSIGNMENT_ID,
    replacementProProfileId: PRO_PROFILE_ID,
    reason: 'Credential handover',
  };

  for (const field of ['companyId', 'assignmentId', 'replacementProProfileId'] as const) {
    for (const invalidId of ['bad', null, 123]) {
      assert.equal(
        reassignCompanyProSchema.safeParse({ ...valid, [field]: invalidId }).success,
        false,
      );
    }
  }

  for (const reason of ['no', '   ', 'x'.repeat(501), null, 123]) {
    assert.equal(reassignCompanyProSchema.safeParse({ ...valid, reason }).success, false);
  }
  for (const reason of ['yes', 'x'.repeat(500)]) {
    assert.equal(reassignCompanyProSchema.safeParse({ ...valid, reason }).success, true);
  }
});

// Equality between the current and replacement PRO is checked atomically by the
// reassign RPC after it locks and resolves the current assignment. The public
// schema intentionally accepts no duplicate currentProProfileId authority input.
