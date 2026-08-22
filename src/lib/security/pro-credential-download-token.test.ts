import assert from 'node:assert/strict';
import test from 'node:test';
import {
  issueProCredentialDownloadToken,
  verifyProCredentialDownloadToken,
} from './pro-credential-download-token';

const E = '40000000-0000-4000-8000-000000000004';
const crypto = {
  encrypt: (value: string) => `cipher:${Buffer.from(value).toString('base64')}`,
  decrypt: (value: string) => Buffer.from(value.slice('cipher:'.length), 'base64').toString(),
};

test('credential download token is opaque, purpose-bound, and expires after 300 seconds', async () => {
  const issued = new Date('2026-08-22T00:00:00.000Z');
  const token = await issueProCredentialDownloadToken(E, issued, crypto);
  assert.doesNotMatch(token, new RegExp(E, 'u'));
  assert.equal(
    await verifyProCredentialDownloadToken(token, new Date(issued.getTime() + 299_000), crypto),
    E,
  );
  await assert.rejects(() =>
    verifyProCredentialDownloadToken(token, new Date(issued.getTime() + 300_000), crypto),
  );
  const tampered = `${token.slice(0, 10)}${token[10] === 'A' ? 'B' : 'A'}${token.slice(11)}`;
  await assert.rejects(() => verifyProCredentialDownloadToken(tampered, issued, crypto));
});

test('credential download rejects a validly encoded encrypted token with the wrong purpose', async () => {
  const issued = new Date('2026-08-22T00:00:00.000Z');
  const issuedAt = Math.floor(issued.getTime() / 1000);
  const encrypted = crypto.encrypt(
    JSON.stringify({
      version: 1,
      purpose: 'different-private-download',
      evidenceId: E,
      issuedAt,
      expiresAt: issuedAt + 300,
    }),
  );
  const token = Buffer.from(encrypted, 'utf8').toString('base64url');
  await assert.rejects(() => verifyProCredentialDownloadToken(token, issued, crypto));
});
