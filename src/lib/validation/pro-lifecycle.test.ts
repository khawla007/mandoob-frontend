import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeProTimelineCursor,
  normalizeProCredentialIdentifier,
  proCommercialTermSchema,
  proCredentialDraftSchema,
  proCredentialDraftSaveSchema,
  proCredentialEvidenceMetadataSchema,
  proCredentialReviewSchema,
  proRegistryFiltersSchema,
  proTimelineCursorSchema,
} from './pro-lifecycle';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';

function draftInput(overrides: Record<string, unknown> = {}) {
  return {
    identifier: 'ab-12 34',
    issuingAuthority: 'Dubai Economy and Tourism',
    issueDate: '2026-01-31',
    expiryDate: '2027-01-31',
    expectedVersion: 0,
    operationId: OPERATION_ID,
    ...overrides,
  };
}

test('normalizes identifiers to uppercase alphanumeric canonical form', () => {
  assert.equal(normalizeProCredentialIdentifier('  ab-12 34  '), 'AB1234');
  assert.equal(proCredentialDraftSchema.parse(draftInput()).identifier, 'AB1234');
});

test('enforces normalized identifier and authority boundaries', () => {
  for (const identifier of ['abc', 'a'.repeat(81), 'AB_1234', 'AB/1234']) {
    assert.equal(proCredentialDraftSchema.safeParse(draftInput({ identifier })).success, false);
  }
  for (const identifier of ['A-123', 'a'.repeat(80)]) {
    assert.equal(proCredentialDraftSchema.safeParse(draftInput({ identifier })).success, true);
  }
  for (const issuingAuthority of ['x', 'x'.repeat(161)]) {
    assert.equal(
      proCredentialDraftSchema.safeParse(draftInput({ issuingAuthority })).success,
      false,
    );
  }
});

test('save boundary accepts an explicit blank identifier for database-side preservation only', () => {
  const parsed = proCredentialDraftSaveSchema.parse(draftInput({ identifier: '   ' }));
  assert.equal(parsed.identifier, '');
  assert.equal(
    proCredentialDraftSchema.safeParse(draftInput({ identifier: '   ' })).success,
    false,
  );
});

test('accepts strict Gregorian dates in order and rejects impossible dates', () => {
  assert.equal(
    proCredentialDraftSchema.safeParse(
      draftInput({ issueDate: '2024-02-29', expiryDate: '2024-02-29' }),
    ).success,
    true,
  );
  for (const dates of [
    { issueDate: '2023-02-29', expiryDate: '2024-01-01' },
    { issueDate: '2026-02-01', expiryDate: '2026-01-31' },
    { issueDate: '01/31/2026', expiryDate: '2027-01-31' },
  ]) {
    assert.equal(proCredentialDraftSchema.safeParse(draftInput(dates)).success, false);
  }
});

test('requires UUID operations and non-negative integer versions', () => {
  for (const overrides of [
    { operationId: 'bad' },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
  ]) {
    assert.equal(proCredentialDraftSchema.safeParse(draftInput(overrides)).success, false);
  }
});

test('review reasons are normalized and required for reject and revoke only', () => {
  const base = { expectedVersion: 2, operationId: OPERATION_ID };
  assert.equal(
    proCredentialReviewSchema.safeParse({ ...base, command: 'begin_review' }).success,
    true,
  );
  assert.equal(proCredentialReviewSchema.safeParse({ ...base, command: 'verify' }).success, true);
  for (const command of ['reject', 'revoke'] as const) {
    const parsed = proCredentialReviewSchema.parse({
      ...base,
      command,
      reasonCode: 'DOCUMENT_INVALID',
      reason: '  Evidence does not match  ',
    });
    assert.ok(parsed.command === 'reject' || parsed.command === 'revoke');
    assert.equal(parsed.reason, 'Evidence does not match');
    for (const reason of ['no', 'x'.repeat(501)]) {
      assert.equal(
        proCredentialReviewSchema.safeParse({
          ...base,
          command,
          reasonCode: 'DOCUMENT_INVALID',
          reason,
        }).success,
        false,
      );
    }
  }
});

test('review reasons reject structured credential secrets without blocking ordinary content', () => {
  const base = { expectedVersion: 2, operationId: OPERATION_ID, reasonCode: 'DOCUMENT_INVALID' };
  const secretReasons = [
    'Credential ciphertext: v1:QUFBQUFBQUFBQUFB:QkJCQkJCQkJCQkJCQkJCQg==:VEFTSzEzQ0FORElEQVRF',
    'Credential signed URL: https://storage.invalid/storage/v1/object/sign/pro-credentials/file.pdf?token=TASK13-CANARY',
    `Identifier hash: ${'0123456789abcdef'.repeat(4)}`,
    'Raw provider error: TASK13-CANARY-RAW-PROVIDER-ERROR',
  ];
  for (const command of ['reject', 'revoke'] as const) {
    for (const reason of secretReasons) {
      const result = proCredentialReviewSchema.safeParse({ ...base, command, reason });
      assert.equal(result.success, false, `${command}: ${reason}`);
      if (!result.success)
        assert.doesNotMatch(JSON.stringify(result.error.flatten()), /TASK13|QUFB|012345/iu);
    }
    for (const reason of [
      'The identifier could not be verified',
      'See https://authority.example for validation guidance',
      `Public case reference ${'0123456789abcdef'.repeat(4)}`,
      'Public revision v2: awaiting confirmation',
    ]) {
      assert.equal(
        proCredentialReviewSchema.safeParse({ ...base, command, reason }).success,
        true,
        `${command}: ${reason}`,
      );
    }
  }
});

test('evidence metadata permits only clean supported files up to 10 MiB', () => {
  const valid = {
    mimeType: 'application/pdf',
    sizeBytes: 10 * 1024 * 1024,
    sha256: 'a'.repeat(64),
    originalNameSafe: 'licence.pdf',
    scanProvider: 'test-scanner',
    scanCompletedAt: '2026-08-21T10:00:00.000Z',
  };
  assert.equal(proCredentialEvidenceMetadataSchema.safeParse(valid).success, true);
  for (const overrides of [
    { mimeType: 'text/plain' },
    { sizeBytes: 10 * 1024 * 1024 + 1 },
    { sizeBytes: 0 },
    { sha256: 'not-a-hash' },
    { originalNameSafe: '../licence.pdf' },
  ]) {
    assert.equal(
      proCredentialEvidenceMetadataSchema.safeParse({ ...valid, ...overrides }).success,
      false,
    );
  }
});

test('commercial terms enforce AED minor units, models, intervals, and date order', () => {
  const base = {
    termKind: 'pricing',
    model: 'per_registration',
    currency: 'AED',
    amountMinor: 12500,
    retainerInterval: null,
    effectiveFrom: '2026-08-21',
    effectiveTo: null,
    operationId: OPERATION_ID,
  };
  assert.equal(proCommercialTermSchema.safeParse(base).success, true);
  assert.equal(
    proCommercialTermSchema.safeParse({
      ...base,
      model: 'retainer',
      retainerInterval: 'monthly',
    }).success,
    true,
  );
  for (const overrides of [
    { currency: 'USD' },
    { amountMinor: 0 },
    { amountMinor: 1.5 },
    { model: 'per_registration', retainerInterval: 'annual' },
    { model: 'retainer', retainerInterval: null },
    { effectiveTo: '2026-08-20' },
  ]) {
    assert.equal(proCommercialTermSchema.safeParse({ ...base, ...overrides }).success, false);
  }
});

test('registry filters allow only bounded pages and approved filters and sorts', () => {
  const parsed = proRegistryFiltersSchema.parse({
    role: 'pro',
    q: '  Fatima  ',
    accountStatus: 'active',
    credentialState: 'verified',
    eligibility: 'eligible',
    assignment: 'unassigned',
    expiryWindow: '30_days',
    sort: 'credential_expiry',
    direction: 'asc',
    page: '2',
  });
  assert.equal(parsed.q, 'Fatima');
  assert.equal(parsed.page, 2);
  for (const overrides of [
    { role: 'customer' },
    { sort: 'email' },
    { page: '0' },
    { page: '1.5' },
    { extra: 'unsafe' },
  ]) {
    assert.equal(proRegistryFiltersSchema.safeParse({ role: 'pro', ...overrides }).success, false);
  }
});

test('timeline cursors are base64url timestamp plus UUID and reject tampering', () => {
  const cursor = Buffer.from(
    JSON.stringify({ eventAt: '2026-08-21T10:00:00.000Z', eventId: EVENT_ID }),
  ).toString('base64url');
  assert.equal(proTimelineCursorSchema.safeParse(cursor).success, true);
  assert.deepEqual(decodeProTimelineCursor(cursor), {
    eventAt: '2026-08-21T10:00:00.000Z',
    eventId: EVENT_ID,
  });
  for (const invalid of [
    'not+base64',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(JSON.stringify({ eventAt: 'bad', eventId: EVENT_ID })).toString('base64url'),
  ]) {
    assert.equal(proTimelineCursorSchema.safeParse(invalid).success, false);
  }
});
