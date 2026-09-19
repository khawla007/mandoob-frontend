process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MULTIPART_BODY_ENVELOPE_BYTES } from '@/app/api/v1/_shared/bounded-body';
import { MAX_DOCUMENT_UPLOAD_BYTES } from '@/lib/documents/upload-contract';
import { ApiError } from '@/lib/errors';
import { createCustomerDocumentUploadPostHandler } from './route-handler';

const ACTOR = '10000000-0000-4000-8000-000000000001';
const TENANT = '20000000-0000-4000-8000-000000000002';
const COMPANY = '30000000-0000-4000-8000-000000000003';
const OPERATION = '40000000-0000-4000-8000-000000000004';
const REQUEST = '50000000-0000-4000-8000-000000000005';
const DOCUMENT = '60000000-0000-4000-8000-000000000006';
const VERSION = '70000000-0000-4000-8000-000000000007';

const authority = { actorId: ACTOR, tenantId: TENANT, companyId: COMPANY };
const params = { params: Promise.resolve({ tenant: 'alpha' }) };

function upload(fields: Record<string, string> = {}, file?: File): Request {
  const form = new FormData();
  form.set('doc_type', 'passport');
  form.set('operation_id', OPERATION);
  form.set('request_id', REQUEST);
  form.set('label', 'Passport');
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set('file', file ?? new File(['%PDF-1.4'], 'passport.pdf', { type: 'application/pdf' }));
  return new Request('http://localhost/api/v1/t/alpha/customer/documents/upload', {
    method: 'POST',
    body: form,
  });
}

function chunkedMultipart(bytes: number): Request {
  let emitted = false;
  return new Request('http://localhost/api/v1/t/alpha/customer/documents/upload', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=fixture' },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted) return controller.close();
        emitted = true;
        controller.enqueue(new Uint8Array(bytes));
      },
    }),
    duplex: 'half',
  } as RequestInit);
}

const base = () => ({
  guardCsrf: async () => null,
  authorize: async () => authority,
  limit: async () => 'allowed' as const,
  submit: async () => ({ documentId: DOCUMENT, versionId: VERSION }),
  revalidate: () => undefined,
  log: () => undefined,
});

test('Customer upload applies CSRF, authorization, and fail-closed limit before reading multipart', async () => {
  for (const denied of [
    {
      overrides: {
        ...base(),
        guardCsrf: async () => Response.json({ code: 'CSRF_REQUIRED' }, { status: 403 }),
      },
      expected: ['csrf'],
      status: 403,
    },
    {
      overrides: { ...base(), authorize: async () => Promise.reject(new Error('denied')) },
      expected: ['csrf', 'authorize'],
      status: 404,
    },
    {
      overrides: { ...base(), limit: async () => 'unavailable' as const },
      expected: ['csrf', 'authorize', 'limit'],
      status: 503,
    },
    {
      overrides: { ...base(), limit: async () => Promise.reject(new Error('rate store secret')) },
      expected: ['csrf', 'authorize', 'limit'],
      status: 503,
    },
  ]) {
    const calls: string[] = [];
    const handler = createCustomerDocumentUploadPostHandler({
      ...denied.overrides,
      guardCsrf: async () => {
        calls.push('csrf');
        return denied.overrides.guardCsrf();
      },
      authorize: async () => {
        calls.push('authorize');
        return denied.overrides.authorize();
      },
      limit: async () => {
        calls.push('limit');
        return denied.overrides.limit();
      },
      submit: async () => {
        calls.push('submit');
        return { documentId: DOCUMENT, versionId: VERSION };
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
    const response = await handler(request, params);
    assert.equal(response.status, denied.status);
    assert.doesNotMatch(await response.text(), /rate store secret/u);
    assert.deepEqual(calls, denied.expected);
  }
});

test('Customer upload rejects declared and chunked body overflow only after auth and limit', async () => {
  const calls: string[] = [];
  const handler = createCustomerDocumentUploadPostHandler({
    ...base(),
    authorize: async () => (calls.push('authorize'), authority),
    limit: async () => (calls.push('limit'), 'allowed'),
    submit: async () => (calls.push('submit'), { documentId: DOCUMENT, versionId: VERSION }),
  });
  const max = MAX_DOCUMENT_UPLOAD_BYTES + MULTIPART_BODY_ENVELOPE_BYTES;
  const declared = upload();
  declared.headers.set('content-length', String(max + 1));
  for (const request of [declared, chunkedMultipart(max + 1)]) {
    const response = await handler(request, params);
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, 'PAYLOAD_TOO_LARGE');
  }
  assert.deepEqual(calls, ['authorize', 'limit', 'authorize', 'limit']);
});

test('Customer upload maps malformed multipart bodies to a safe validation response', async () => {
  const handler = createCustomerDocumentUploadPostHandler(base());
  for (const request of [
    new Request('http://localhost/upload', { method: 'POST', body: 'not multipart' }),
    new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=missing' },
      body: 'invalid',
    }),
  ]) {
    const response = await handler(request, params);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Invalid upload',
      code: 'VALIDATION_FAILED',
    });
  }
});

test('Customer upload logs authorization failures under a fixed label before safe not-found', async () => {
  const logs: unknown[][] = [];
  const handler = createCustomerDocumentUploadPostHandler({
    ...base(),
    authorize: async () => Promise.reject(new Error('private authorization detail')),
    log: (...args) => logs.push(args),
  });
  const response = await handler(upload(), params);
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /private authorization detail/u);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.[0], 'customer.document.upload.authorize');
});

test('Customer upload accepts the exact bounded multipart contract and delegates authority', async () => {
  const received: unknown[] = [];
  const handler = createCustomerDocumentUploadPostHandler({
    ...base(),
    submit: async (...args) => {
      received.push(args);
      return { documentId: DOCUMENT, versionId: VERSION };
    },
  });
  const response = await handler(upload(), params);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { documentId: DOCUMENT, versionId: VERSION },
  });
  assert.equal(received.length, 1);
  const [resolved, fields, file, requestMetadata] = received[0] as [
    unknown,
    Record<string, string>,
    File,
    Record<string, unknown>,
  ];
  assert.deepEqual(resolved, authority);
  assert.deepEqual(fields, {
    doc_type: 'passport',
    operation_id: OPERATION,
    request_id: REQUEST,
    label: 'Passport',
  });
  assert.equal(file.name, 'passport.pdf');
  assert.equal(requestMetadata.ip, 'unknown');
});

test('Customer upload accepts an exact 25 MiB file through the bounded multipart reader', async () => {
  let submittedSize = 0;
  const handler = createCustomerDocumentUploadPostHandler({
    ...base(),
    submit: async (_authority, _fields, file) => {
      submittedSize = file.size;
      return { documentId: DOCUMENT, versionId: VERSION };
    },
  });
  const response = await handler(
    upload({}, new File([new Uint8Array(MAX_DOCUMENT_UPLOAD_BYTES)], 'passport.pdf')),
    params,
  );
  assert.equal(response.status, 200);
  assert.equal(submittedSize, MAX_DOCUMENT_UPLOAD_BYTES);
});

test('Customer upload rejects duplicate, missing, extra, empty, and oversized file parts', async () => {
  const submitted: unknown[] = [];
  const handler = createCustomerDocumentUploadPostHandler({
    ...base(),
    submit: async (...args) => {
      submitted.push(args);
      return { documentId: DOCUMENT, versionId: VERSION };
    },
  });
  const dirty = upload();
  const dirtyForm = await dirty.formData();
  dirtyForm.set('unexpected', 'value');
  const duplicate = upload();
  const duplicateForm = await duplicate.formData();
  duplicateForm.append('doc_type', 'visa');
  const missing = upload();
  const missingForm = await missing.formData();
  missingForm.delete('operation_id');
  const fixtures = [
    new Request(dirty.url, { method: 'POST', body: dirtyForm }),
    new Request(duplicate.url, { method: 'POST', body: duplicateForm }),
    new Request(missing.url, { method: 'POST', body: missingForm }),
    upload({}, new File([], 'empty.pdf', { type: 'application/pdf' })),
    upload({}, new File([new Uint8Array(MAX_DOCUMENT_UPLOAD_BYTES + 1)], 'large.pdf')),
  ];
  for (const request of fixtures) assert.notEqual((await handler(request, params)).status, 200);
  assert.equal(submitted.length, 0);
});

test('Customer upload exposes only allowlisted errors and sanitizes unexpected failures', async () => {
  const allowed = createCustomerDocumentUploadPostHandler({
    ...base(),
    submit: async () => {
      throw new ApiError('CONFLICT', 'private fingerprint mismatch', 409);
    },
  });
  const conflict = await allowed(upload(), params);
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), {
    error: 'Unable to upload document',
    code: 'OPERATION_REUSED',
  });

  const unexpected = createCustomerDocumentUploadPostHandler({
    ...base(),
    submit: async () => Promise.reject(new Error('storage/tenant/private-path')),
  });
  const failed = await unexpected(upload(), params);
  assert.equal(failed.status, 500);
  const body = await failed.text();
  assert.match(body, /UPLOAD_FAILED/u);
  assert.doesNotMatch(body, /storage|tenant|private-path/iu);
});

test('Customer upload validates and projects the exact public receipt at runtime', async () => {
  for (const malformed of [
    { documentId: DOCUMENT },
    { documentId: 'not-a-uuid', versionId: VERSION },
    { documentId: DOCUMENT, versionId: VERSION, storagePath: 'private/path' },
  ]) {
    const logs: unknown[][] = [];
    const handler = createCustomerDocumentUploadPostHandler({
      ...base(),
      submit: async () => malformed as never,
      log: (...args) => logs.push(args),
    });
    const response = await handler(upload(), params);
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.match(body, /UPLOAD_FAILED/u);
    assert.doesNotMatch(body, /storagePath|private\/path|not-a-uuid/u);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.[0], 'customer.document.upload.route');
  }
});

test('Customer upload proxy limit covers 25 MiB plus envelope without raising Server Actions', () => {
  const config = readFileSync('next.config.ts', 'utf8');
  assert.match(config, /proxyClientMaxBodySize:\s*26 \* 1024 \* 1024/u);
  assert.match(config, /bodySizeLimit:\s*'9mb'/u);
});
