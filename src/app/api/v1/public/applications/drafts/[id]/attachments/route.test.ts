import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';
process.env.ENCRYPTION_KEY = 'encryption-key-with-enough-length-32chars';

const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const ATT_ID = '66666666-6666-4666-8666-666666666666';
const TOKEN = 'opaque-resume-secret-value-abcdef';
const OP_ID = '11111111-1111-4111-8111-111111111111';

function uploadRequest(
  { origin = 'https://mandoob.test', token = TOKEN as string | null, fieldId = 'passport_copy' } = {},
) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' }));
  if (fieldId) form.set('fieldId', fieldId);
  form.set('operationId', OP_ID);
  const headers: Record<string, string> = { origin };
  if (token) headers['x-resume-token'] = token;
  return new Request(`https://mandoob.test/api/v1/public/applications/drafts/${DRAFT_ID}/attachments`, {
    method: 'POST',
    headers,
    body: form,
  });
}

const okUpload = async () => ({ attachmentId: ATT_ID, fieldId: 'passport_copy', scanState: 'clean' as const });

const base = {
  appUrl: 'https://mandoob.test',
  rateLimit: async () => 'allowed' as const,
  upload: okUpload,
};

test('accepts a clean attachment and returns its receipt', async () => {
  const { handleUploadAttachmentPost } = await import('./handler');
  const response = await handleUploadAttachmentPost(uploadRequest() as never, DRAFT_ID, base);
  assert.equal(response.status, 201);
  const json = await response.json();
  assert.equal(json.attachmentId, ATT_ID);
  assert.equal(json.scanState, 'clean');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rejects cross-origin, missing token, and malformed multipart before upload', async () => {
  const { handleUploadAttachmentPost } = await import('./handler');
  const guard = { ...base, upload: async () => { throw new Error('must not persist'); } };
  assert.equal((await handleUploadAttachmentPost(uploadRequest({ origin: 'https://evil.test' }) as never, DRAFT_ID, guard)).status, 403);
  assert.equal((await handleUploadAttachmentPost(uploadRequest({ token: null }) as never, DRAFT_ID, guard)).status, 404);
  assert.equal((await handleUploadAttachmentPost(uploadRequest({ fieldId: '' }) as never, DRAFT_ID, guard)).status, 400);
});

test('maps malware, scanner outage, duplicate, and unknown-draft failures to safe statuses', async () => {
  const { handleUploadAttachmentPost } = await import('./handler');
  const withUpload = (message: string) => ({
    ...base,
    upload: async () => { throw new Error(message); },
  });
  assert.equal((await handleUploadAttachmentPost(uploadRequest() as never, DRAFT_ID, withUpload('MALWARE_DETECTED'))).status, 422);
  assert.equal((await handleUploadAttachmentPost(uploadRequest() as never, DRAFT_ID, withUpload('SCANNER_UNAVAILABLE'))).status, 503);
  assert.equal((await handleUploadAttachmentPost(uploadRequest() as never, DRAFT_ID, withUpload('ATTACHMENT_DUPLICATE'))).status, 409);
  assert.equal((await handleUploadAttachmentPost(uploadRequest() as never, DRAFT_ID, withUpload('DRAFT_UNAVAILABLE'))).status, 404);
});

test('deletes an attachment via a same-origin authorized request', async () => {
  const { handleDeleteAttachment } = await import('./handler');
  const request = new Request(
    `https://mandoob.test/api/v1/public/applications/drafts/${DRAFT_ID}/attachments`,
    {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        origin: 'https://mandoob.test',
        'x-resume-token': TOKEN,
      },
      body: JSON.stringify({ attachmentId: ATT_ID, operationId: OP_ID }),
    },
  );
  const response = await handleDeleteAttachment(request as never, DRAFT_ID, {
    ...base,
    remove: async () => ({ deleted: true }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deleted, true);
});
