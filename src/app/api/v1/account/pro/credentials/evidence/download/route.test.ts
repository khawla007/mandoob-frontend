import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvidenceDownloadHandler } from './route';

const A = '10000000-0000-4000-8000-000000000001';
const C = '20000000-0000-4000-8000-000000000002';
const E = '40000000-0000-4000-8000-000000000004';

test('opaque download reauthorizes and streams without exposing storage path or redirecting', async () => {
  const handler = createEvidenceDownloadHandler({
    requireViewer: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    verifyToken: async (token) => {
      assert.equal(token, 'opaque');
      return E;
    },
    open: async () => ({
      evidence_id: E,
      pro_profile_id: A,
      credential_id: C,
      storage_path: `pro-credentials/${A}/${C}/${E}`,
      mime_type: 'application/pdf',
      size_bytes: 5,
      original_name_safe: 'proof.pdf',
    }),
    download: async () => new Blob(['%PDF-'], { type: 'application/pdf' }),
  });
  const response = await handler(
    new Request('http://localhost/api/v1/account/pro/credentials/evidence/download', {
      headers: { authorization: 'Bearer opaque' },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.doesNotMatch(JSON.stringify([...response.headers]), /pro-credentials|10000000|20000000/iu);
  assert.equal(await response.text(), '%PDF-');
});

test('opaque download hides expired/invalid tokens and authorization failures', async () => {
  const session = async () => ({
    id: A,
    role: 'pro' as const,
    tenantId: A,
    aal: 'aal2' as const,
    mfaEnrolled: true,
    email: null,
  });
  for (const handler of [
    createEvidenceDownloadHandler({
      requireViewer: session,
      verifyToken: async () => {
        throw new Error('expired');
      },
    }),
    createEvidenceDownloadHandler({
      requireViewer: session,
      verifyToken: async () => E,
      open: async () => {
        throw new Error('cross pro');
      },
    }),
  ]) {
    const response = await handler(
      new Request('http://localhost/api/v1/account/pro/credentials/evidence/download', {
        headers: { authorization: 'Bearer opaque' },
      }),
    );
    assert.equal(response.status, 404);
    assert.doesNotMatch(JSON.stringify(await response.json()), /expired|cross|path/iu);
  }
});

test('download credentials are rejected in URL query parameters', async () => {
  let verified = false;
  const response = await createEvidenceDownloadHandler({
    requireViewer: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    verifyToken: async () => {
      verified = true;
      return E;
    },
  })(new Request('http://localhost/api/v1/account/pro/credentials/evidence/download?token=opaque'));
  assert.equal(response.status, 404);
  assert.equal(verified, false);
});
