import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PRO_ID = '20000000-0000-4000-8000-000000000002';
const CREDENTIAL_ID = '30000000-0000-4000-8000-000000000003';
const CANARY = 'LIC-9Z 72';

function deps(overrides: Record<string, unknown> = {}) {
  return {
    loadCredential: async () => ({
      proProfileId: PRO_ID,
      identifierCiphertext: 'ciphertext-only',
    }),
    decryptIdentifier: () => CANARY,
    ...overrides,
  };
}

test('decision reason guard rejects exact and obfuscated full credential identifiers', async () => {
  const { assertDecisionReasonExcludesCredentialIdentifier } =
    await import('./pro-credential-decision-reason');
  for (const reason of [
    'LIC-9Z 72',
    'lic 9z-72',
    'Document identifier lic / 9z / 72 could not be verified',
  ]) {
    await assert.rejects(
      () => assertDecisionReasonExcludesCredentialIdentifier(PRO_ID, CREDENTIAL_ID, reason, deps()),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        'status' in error &&
        error.code === 'DECISION_REASON_INVALID' &&
        error.status === 422 &&
        !error.message.includes(CANARY),
    );
  }
});

test('decision reason guard accepts unrelated reasons without returning plaintext', async () => {
  const { assertDecisionReasonExcludesCredentialIdentifier } =
    await import('./pro-credential-decision-reason');
  assert.equal(
    await assertDecisionReasonExcludesCredentialIdentifier(
      PRO_ID,
      CREDENTIAL_ID,
      'The issuing authority could not confirm the document',
      deps(),
    ),
    undefined,
  );
});

test('decision reason guard hides missing, cross-PRO, query, and decrypt failures', async () => {
  const { assertDecisionReasonExcludesCredentialIdentifier } =
    await import('./pro-credential-decision-reason');
  const missing = deps({ loadCredential: async () => null });
  const crossPro = deps({
    loadCredential: async () => ({
      proProfileId: '20000000-0000-4000-8000-000000000099',
      identifierCiphertext: 'private-cross-owner-ciphertext',
    }),
  });
  for (const dependency of [missing, crossPro]) {
    await assert.rejects(
      () =>
        assertDecisionReasonExcludesCredentialIdentifier(
          PRO_ID,
          CREDENTIAL_ID,
          'Unrelated reason',
          dependency,
        ),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        'status' in error &&
        error.code === 'NOT_FOUND' &&
        error.status === 404 &&
        !/private|ciphertext/iu.test(error.message),
    );
  }
  for (const dependency of [
    deps({ loadCredential: async () => Promise.reject(new Error('private query detail')) }),
    deps({
      decryptIdentifier: () => {
        throw new Error('private decrypt detail');
      },
    }),
  ]) {
    await assert.rejects(
      () =>
        assertDecisionReasonExcludesCredentialIdentifier(
          PRO_ID,
          CREDENTIAL_ID,
          'Unrelated reason',
          dependency,
        ),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        'status' in error &&
        error.code === 'INTERNAL' &&
        error.status === 500 &&
        !/private|decrypt|query/iu.test(error.message),
    );
  }
});

test('decision reason guard source confines ciphertext and decrypt to transient validation', () => {
  const source = readFileSync('src/lib/data/pro-credential-decision-reason.ts', 'utf8');
  assert.match(source, /select\('pro_profile_id, identifier_ciphertext'\)/u);
  assert.doesNotMatch(source, /console\.|unstable_cache|revalidate|jsonOk|Response/u);
  assert.doesNotMatch(source, /return\s+(?:identifier|plaintext|decrypted)/u);
  for (const path of [
    'src/app/api/v1/admin/users/[id]/credentials/route.ts',
    'src/app/api/v1/_shared/pro-lifecycle-routes.ts',
    'src/lib/data/pro-credentials.ts',
    'src/lib/validation/pro-lifecycle.ts',
  ]) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /\bdecrypt\b/u, path);
  }
  assert.doesNotMatch(
    readFileSync('src/app/api/v1/admin/users/[id]/credentials/route.ts', 'utf8'),
    /identifier_ciphertext/u,
  );
});
