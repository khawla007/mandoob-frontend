import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProCredentialEvidencePath,
  isOwnedProCredentialEvidencePath,
} from './pro-credential-path';

const PRO_ID = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL_ID = '22222222-2222-4222-8222-222222222222';
const EVIDENCE_ID = '33333333-3333-4333-8333-333333333333';

test('builds the exact generated private evidence path', () => {
  assert.equal(
    buildProCredentialEvidencePath(PRO_ID, CREDENTIAL_ID, EVIDENCE_ID),
    `pro-credentials/${PRO_ID}/${CREDENTIAL_ID}/${EVIDENCE_ID}`,
  );
});

test('validates the complete PRO to credential to evidence ownership path', () => {
  const path = buildProCredentialEvidencePath(PRO_ID, CREDENTIAL_ID, EVIDENCE_ID);
  assert.equal(isOwnedProCredentialEvidencePath(path, PRO_ID, CREDENTIAL_ID, EVIDENCE_ID), true);
  for (const invalid of [
    path.replace(PRO_ID, '44444444-4444-4444-8444-444444444444'),
    path.replace(CREDENTIAL_ID, '44444444-4444-4444-8444-444444444444'),
    path.replace(EVIDENCE_ID, '44444444-4444-4444-8444-444444444444'),
    `/${path}`,
    `${path}/extra`,
    `pro-credentials/${PRO_ID}/${CREDENTIAL_ID}/../${EVIDENCE_ID}`,
    `pro-credentials/${PRO_ID}/${CREDENTIAL_ID}/%2e%2e`,
  ]) {
    assert.equal(
      isOwnedProCredentialEvidencePath(invalid, PRO_ID, CREDENTIAL_ID, EVIDENCE_ID),
      false,
      invalid,
    );
  }
});

test('rejects malformed identifiers before generating a path', () => {
  assert.throws(
    () => buildProCredentialEvidencePath('not-a-uuid', CREDENTIAL_ID, EVIDENCE_ID),
    /identifier/u,
  );
});
