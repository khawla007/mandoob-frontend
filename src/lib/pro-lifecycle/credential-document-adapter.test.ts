import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '@/lib/errors';
import { PRO_CREDENTIAL_EVIDENCE_MAX_BYTES } from '@/lib/validation/pro-lifecycle';
import { validateCredentialDocumentUpload } from './credential-document-adapter';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

test('credential adapter delegates to the frozen document validator with the 10 MiB boundary', async () => {
  const result = await validateCredentialDocumentUpload({
    data: PDF,
    filename: 'License.PDF',
    mimeType: 'application/pdf',
  });
  assert.equal(result.mimeType, 'application/pdf');
  assert.equal(result.sizeBytes, PDF.byteLength);
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
  assert.notEqual(result.data, PDF);
  assert.equal(PRO_CREDENTIAL_EVIDENCE_MAX_BYTES, 10 * 1024 * 1024);
});

test('credential adapter keeps DOCX outside the credential evidence contract', async () => {
  const zip = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  await assert.rejects(
    validateCredentialDocumentUpload({
      data: zip,
      filename: 'license.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    (error: unknown) => error instanceof ApiError && error.code === 'UNSUPPORTED_MEDIA_TYPE',
  );
});

test('credential adapter preserves sanitized validation errors without provider details', async () => {
  await assert.rejects(
    validateCredentialDocumentUpload({
      data: PDF,
      filename: '../license.pdf',
      mimeType: 'application/pdf',
    }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === 'VALIDATION_FAILED' &&
      !/path|storage|provider/iu.test(error.message),
  );
});
