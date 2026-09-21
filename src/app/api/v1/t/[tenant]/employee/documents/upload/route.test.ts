process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import assert from 'node:assert/strict';
import test from 'node:test';
import { MULTIPART_BODY_ENVELOPE_BYTES } from '@/app/api/v1/_shared/bounded-body';
import { MAX_DOCUMENT_UPLOAD_BYTES } from '@/lib/documents/upload-contract';
import { ApiError } from '@/lib/errors';
import { createEmployeeDocumentUploadPostHandler } from './route-handler';

const ACTOR = '10000000-0000-4000-8000-000000000001';
const TENANT = '20000000-0000-4000-8000-000000000002';
const COMPANY = '30000000-0000-4000-8000-000000000003';
const EMPLOYEE = '40000000-0000-4000-8000-000000000004';
const OPERATION = '50000000-0000-4000-8000-000000000005';
const REQUEST = '60000000-0000-4000-8000-000000000006';
const DOCUMENT = '70000000-0000-4000-8000-000000000007';
const VERSION = '80000000-0000-4000-8000-000000000008';
const authority = { actorId: ACTOR, tenantId: TENANT, companyId: COMPANY, employeeId: EMPLOYEE };
const context = { params: Promise.resolve({ tenant: 'alpha' }) };

function upload(file = new File(['%PDF-1.4'], 'passport.pdf', { type: 'application/pdf' })) {
  const form = new FormData();
  form.set('doc_type', 'passport');
  form.set('operation_id', OPERATION);
  form.set('request_id', REQUEST);
  form.set('label', 'Passport');
  form.set('file', file);
  return new Request('http://localhost/api/v1/t/alpha/employee/documents/upload', {
    method: 'POST',
    body: form,
  });
}

const base = () => ({
  guardCsrf: async () => null,
  authorize: async () => authority,
  limit: async () => 'allowed' as const,
  submit: async () => ({ documentId: DOCUMENT, versionId: VERSION }),
  revalidate: () => undefined,
  log: () => undefined,
});

test('Employee upload applies CSRF, fresh self authority, and rate limit before body read', async () => {
  for (const denied of ['csrf', 'authorize', 'limit'] as const) {
    const calls: string[] = [];
    const handler = createEmployeeDocumentUploadPostHandler({
      ...base(),
      guardCsrf: async () => {
        calls.push('csrf');
        return denied === 'csrf' ? new Response(null, { status: 403 }) : null;
      },
      authorize: async () => {
        calls.push('authorize');
        if (denied === 'authorize') throw new Error('private actor');
        return authority;
      },
      limit: async () => {
        calls.push('limit');
        return denied === 'limit' ? 'unavailable' : 'allowed';
      },
    });
    const request = upload();
    const body = request.body;
    Object.defineProperty(request, 'body', {
      configurable: true,
      get() {
        calls.push('body');
        return body;
      },
    });
    const response = await handler(request, context);
    assert.equal(response.status, denied === 'authorize' ? 404 : denied === 'limit' ? 503 : 403);
    assert.deepEqual(
      calls,
      denied === 'csrf'
        ? ['csrf']
        : denied === 'authorize'
          ? ['csrf', 'authorize']
          : ['csrf', 'authorize', 'limit'],
    );
  }
});

test('Employee upload limits the authoritative actor and Company before reading multipart', async () => {
  const calls: unknown[] = [];
  const handler = createEmployeeDocumentUploadPostHandler({
    ...base(),
    authorize: async () => (calls.push(['authorize']), authority),
    limit: async (...args) => {
      calls.push(['limit', ...args]);
      return 'limited';
    },
  });
  const request = upload();
  const body = request.body;
  Object.defineProperty(request, 'body', {
    configurable: true,
    get() {
      calls.push(['body']);
      return body;
    },
  });
  const response = await handler(request, context);
  assert.equal(response.status, 429);
  assert.deepEqual(calls, [['authorize'], ['limit', ACTOR, COMPANY]]);
});

test('Employee upload accepts exact 25 MiB and projects the strict public receipt', async () => {
  let size = 0;
  const handler = createEmployeeDocumentUploadPostHandler({
    ...base(),
    submit: async (_authority, _fields, file) => {
      size = file.size;
      return { documentId: DOCUMENT, versionId: VERSION };
    },
  });
  const response = await handler(
    upload(new File([new Uint8Array(MAX_DOCUMENT_UPLOAD_BYTES)], 'passport.pdf')),
    context,
  );
  assert.equal(response.status, 200);
  assert.equal(size, MAX_DOCUMENT_UPLOAD_BYTES);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { documentId: DOCUMENT, versionId: VERSION },
  });
});

test('Employee upload rejects overflow before submission and maps failures safely', async () => {
  let submitted = 0;
  const handler = createEmployeeDocumentUploadPostHandler({
    ...base(),
    submit: async () => {
      submitted += 1;
      throw new ApiError('FORBIDDEN', 'foreign employee private detail', 403);
    },
  });
  const oversized = upload();
  oversized.headers.set(
    'content-length',
    String(MAX_DOCUMENT_UPLOAD_BYTES + MULTIPART_BODY_ENVELOPE_BYTES + 1),
  );
  assert.equal((await handler(oversized, context)).status, 413);
  assert.equal(submitted, 0);
  const denied = await handler(upload(), context);
  assert.equal(denied.status, 404);
  assert.doesNotMatch(await denied.text(), /foreign|employee|private detail/iu);
});

test('Employee upload rejects optional request omission, duplicate fields, and leaked receipts', async () => {
  const handler = createEmployeeDocumentUploadPostHandler({
    ...base(),
    submit: async () =>
      ({ documentId: DOCUMENT, versionId: VERSION, storagePath: 'private/path' }) as never,
  });
  const missingForm = await upload().formData();
  missingForm.delete('request_id');
  assert.equal(
    (
      await handler(
        new Request('http://localhost/upload', { method: 'POST', body: missingForm }),
        context,
      )
    ).status,
    400,
  );
  const duplicate = await upload().formData();
  duplicate.append('request_id', REQUEST);
  assert.equal(
    (
      await handler(
        new Request('http://localhost/upload', { method: 'POST', body: duplicate }),
        context,
      )
    ).status,
    400,
  );
  const leaked = await handler(upload(), context);
  assert.equal(leaked.status, 500);
  assert.doesNotMatch(await leaked.text(), /storagePath|private\/path/u);
});
