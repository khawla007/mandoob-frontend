process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.VIRUSTOTAL_API_KEY = 'vt_test_key';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@/lib/errors';

type DocumentsModule = typeof import('./documents');
let mod: DocumentsModule | null = null;
async function load(): Promise<DocumentsModule> {
  if (!mod) mod = await import('./documents');
  return mod;
}

const originalFetch = globalThis.fetch;

const TENANT = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const DOCUMENT = '55555555-5555-4555-8555-555555555555';
const VERSION = '66666666-6666-4666-8666-666666666666';
const ACTOR = '77777777-7777-4777-8777-777777777777';
const REQUEST = '88888888-8888-4888-8888-888888888888';

type FetchCall = { url: string; method: string; body: unknown };

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function captureFetch(handler: (call: FetchCall) => Response | Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input, init) => {
    const text = typeof init?.body === 'string' ? init.body : undefined;
    const call = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: text ? JSON.parse(text) : undefined,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

function ownedVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: VERSION,
    tenant_id: TENANT,
    storage_path: `${TENANT}/${CLIENT}/passport/file.pdf`,
    document: {
      id: DOCUMENT,
      tenant_id: TENANT,
      client_id: CLIENT,
      request_id: REQUEST,
      current_version_id: VERSION,
      client: { id: CLIENT, tenant_id: TENANT },
    },
    ...overrides,
  };
}

function reviewCtx() {
  return {
    tenantId: TENANT,
    actorId: ACTOR,
    role: 'pro' as const,
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };
}

function pdfWith(body: string): Uint8Array {
  return Buffer.from(`%PDF-1.4\n${body}\n%%EOF`);
}

function uploadInput(data: Uint8Array) {
  return {
    tenantId: '11111111-1111-4111-8111-111111111111',
    clientId: '22222222-2222-4222-8222-222222222222',
    docType: 'passport' as const,
    requestId: '33333333-3333-4333-8333-333333333333',
    label: 'Passport',
    file: {
      data,
      originalName: 'passport.pdf',
      mimeType: 'application/pdf',
    },
    actor: {
      id: '44444444-4444-4444-8444-444444444444',
      role: 'customer' as const,
      ip: '127.0.0.1',
      userAgent: 'node-test',
    },
  };
}

async function assertUploadRejects(
  data: Uint8Array,
  expectedCode: string,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  const urls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    urls.push(String(input));
    return fetchImpl(input, init);
  }) as typeof fetch;

  const { uploadDocument } = await load();
  await assert.rejects(
    () => uploadDocument(uploadInput(data)),
    (err) => err instanceof ApiError && err.code === expectedCode,
  );
  return urls;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('uploadDocument rejects EICAR before storage or document inserts and writes audit', async () => {
  const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  const urls = await assertUploadRejects(pdfWith(eicar), 'FILE_REJECTED_BY_SCAN', async () =>
    Response.json([], { status: 201 }),
  );

  assert.equal(urls.filter((url) => url.includes('/rest/v1/tenant_audit_log')).length, 1);
  assert.equal(
    urls.some((url) => url.includes('/storage/v1/object/tenant-documents')),
    false,
  );
  assert.equal(
    urls.some((url) => url.includes('/rest/v1/documents')),
    false,
  );
  assert.equal(
    urls.some((url) => url.includes('/rest/v1/document_versions')),
    false,
  );
});

test('uploadDocument returns SCANNER_UNAVAILABLE when provider fails closed', async () => {
  const urls = await assertUploadRejects(
    pdfWith('clean but scanner unavailable'),
    'SCANNER_UNAVAILABLE',
    async (input) => {
      const url = String(input);
      if (url === 'https://www.virustotal.com/api/v3/files') {
        return new Response('provider unavailable', { status: 500 });
      }
      return Response.json([], { status: 201 });
    },
  );

  assert.equal(urls.filter((url) => url.includes('/rest/v1/tenant_audit_log')).length, 1);
  assert.equal(
    urls.some((url) => url.includes('/storage/v1/object/tenant-documents')),
    false,
  );
  assert.equal(
    urls.some((url) => url.includes('/rest/v1/documents')),
    false,
  );
  assert.equal(
    urls.some((url) => url.includes('/rest/v1/document_versions')),
    false,
  );
});

test('getDocumentSignedUrl rejects invalid UUIDs and a missing version before signing', async () => {
  const calls = captureFetch(() => json(null));
  const { getDocumentSignedUrl } = await load();

  await assert.rejects(
    () => getDocumentSignedUrl('not-a-uuid', VERSION),
    (err) => err instanceof ApiError && err.code === 'VALIDATION_FAILED',
  );
  assert.equal(calls.length, 0);

  await assert.rejects(
    () => getDocumentSignedUrl(TENANT, VERSION),
    (err) => err instanceof ApiError && err.code === 'NOT_FOUND',
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls.some((call) => call.url.includes('/storage/v1/object/sign/')),
    false,
  );
});

test('getDocumentSignedUrl requires the full version-document-client ownership chain', async () => {
  const foreignTenant = '99999999-9999-4999-8999-999999999999';
  const mismatches = [
    ownedVersion({ tenant_id: foreignTenant }),
    ownedVersion({ document: { ...ownedVersion().document, tenant_id: foreignTenant } }),
    ownedVersion({
      document: {
        ...ownedVersion().document,
        client_id: foreignTenant,
        client: { id: CLIENT, tenant_id: TENANT },
      },
    }),
    ownedVersion({
      document: {
        ...ownedVersion().document,
        client: { id: CLIENT, tenant_id: foreignTenant },
      },
    }),
  ];
  let index = 0;
  const calls = captureFetch(() => json(mismatches[index++]));
  const { getDocumentSignedUrl } = await load();

  for (const mismatch of mismatches) {
    void mismatch;
    await assert.rejects(
      () => getDocumentSignedUrl(TENANT, VERSION),
      (err) => err instanceof ApiError && err.code === 'NOT_FOUND',
    );
  }

  assert.equal(calls.length, mismatches.length);
  assert.equal(
    calls.some((call) => call.url.includes('/storage/v1/object/sign/')),
    false,
  );
});

test('getDocumentSignedUrl rejects a tampered storage prefix and signs only the stored path with TTL', async () => {
  const tamperedCalls = captureFetch(() =>
    json(ownedVersion({ storage_path: `${TENANT}/99999999-9999-4999-8999-999999999999/file.pdf` })),
  );
  const { getDocumentSignedUrl } = await load();

  await assert.rejects(
    () => getDocumentSignedUrl(TENANT, VERSION, 91),
    (err) => err instanceof ApiError && err.code === 'NOT_FOUND',
  );
  assert.equal(tamperedCalls.length, 1);

  const storedPath = `${TENANT}/${CLIENT}/passport/server-held.pdf`;
  const calls = captureFetch((call) => {
    if (call.url.includes('/rest/v1/document_versions')) {
      return json(ownedVersion({ storage_path: storedPath }));
    }
    if (call.url.includes('/storage/v1/object/sign/')) {
      return json({ signedURL: '/object/sign/private?token=test' });
    }
    return json({ message: 'unexpected request' }, 500);
  });
  const before = Date.now();
  const result = await getDocumentSignedUrl(TENANT, VERSION, 91);

  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'url']);
  assert.equal(result.url, 'https://test.supabase.co/storage/v1/object/sign/private?token=test');
  assert.ok(Date.parse(result.expiresAt) >= before + 90_000);
  const signCall = calls.find((call) => call.url.includes('/storage/v1/object/sign/'));
  assert.ok(signCall);
  assert.match(decodeURIComponent(signCall.url), new RegExp(storedPath.replaceAll('/', '\\/')));
  assert.deepEqual(signCall.body, { expiresIn: 91 });
});

test('getDocumentSignedUrl sanitizes database and storage failures', async () => {
  const { getDocumentSignedUrl } = await load();
  captureFetch(() => json({ code: 'XX000', message: 'secret database detail' }, 500));
  await assert.rejects(
    () => getDocumentSignedUrl(TENANT, VERSION),
    (err) =>
      err instanceof ApiError &&
      err.code === 'INTERNAL' &&
      !err.message.includes('secret database detail'),
  );

  captureFetch((call) =>
    call.url.includes('/rest/v1/document_versions')
      ? json(ownedVersion())
      : json({ message: 'secret storage detail' }, 500),
  );
  await assert.rejects(
    () => getDocumentSignedUrl(TENANT, VERSION),
    (err) =>
      err instanceof ApiError &&
      err.code === 'STORAGE_SIGN_FAILED' &&
      !err.message.includes('secret storage detail'),
  );
});

test('setDocumentReview validates role, UUID, and required rejection note before I/O', async () => {
  const calls = captureFetch(() => json(null));
  const { setDocumentReview } = await load();

  await assert.rejects(
    () =>
      setDocumentReview(
        VERSION,
        { ...reviewCtx(), role: 'customer' as never },
        { status: 'approved' },
      ),
    (err) => err instanceof ApiError && err.code === 'FORBIDDEN',
  );
  await assert.rejects(() => setDocumentReview('bad-id', reviewCtx(), { status: 'approved' }));
  await assert.rejects(() =>
    setDocumentReview(VERSION, reviewCtx(), { status: 'rejected', note: '   ' }),
  );
  assert.equal(calls.length, 0);
});

test('setDocumentReview uses one exact atomic RPC and emits auth telemetry only after success', async () => {
  const calls = captureFetch((call) => {
    if (call.url.endsWith('/rest/v1/rpc/review_document_version')) {
      return json({
        document_id: DOCUMENT,
        client_id: CLIENT,
        fulfilled_request_id: REQUEST,
        review_status: 'approved',
      });
    }
    if (call.url.includes('/rest/v1/auth_events')) return json(null, 201);
    return json({ message: 'legacy write attempted' }, 500);
  });
  const { setDocumentReview } = await load();

  await setDocumentReview(VERSION, reviewCtx(), { status: 'approved', note: ' looks good ' });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/review_document_version$/u);
  assert.deepEqual(calls[0].body, {
    p_tenant_id: TENANT,
    p_actor_id: ACTOR,
    p_version_id: VERSION,
    p_status: 'approved',
    p_note: 'looks good',
    p_reviewed_at: (calls[0].body as Record<string, unknown>).p_reviewed_at,
  });
  assert.equal(
    Number.isNaN(Date.parse((calls[0].body as Record<string, string>).p_reviewed_at)),
    false,
  );
  assert.match(calls[1].url, /\/rest\/v1\/auth_events$/u);
  assert.equal(
    calls.some((call) => call.url.includes('/tenant_audit_log')),
    false,
  );
  assert.equal(
    calls.some((call) => call.url.includes('/rest/v1/documents?')),
    false,
  );
  assert.equal(
    calls.some((call) => call.url.includes('/rest/v1/document_requests')),
    false,
  );
  assert.equal(
    calls.some((call) => call.url.includes('/rest/v1/document_versions?')),
    false,
  );
});

test('setDocumentReview supports rejection through the RPC without fulfilling a request', async () => {
  const calls = captureFetch((call) => {
    if (call.url.endsWith('/rest/v1/rpc/review_document_version')) {
      return json({
        document_id: DOCUMENT,
        client_id: CLIENT,
        fulfilled_request_id: null,
        review_status: 'rejected',
      });
    }
    return json(null, 201);
  });
  const { setDocumentReview } = await load();

  await setDocumentReview(VERSION, reviewCtx(), { status: 'rejected', note: 'Unreadable' });

  assert.equal((calls[0].body as Record<string, unknown>).p_status, 'rejected');
  assert.equal((calls[0].body as Record<string, unknown>).p_note, 'Unreadable');
  assert.equal(
    calls.some((call) => call.url.includes('/document_requests')),
    false,
  );
});

test('setDocumentReview maps controlled and zero-row RPC failures without telemetry or raw details', async () => {
  const scenarios = [
    { response: json(null), code: 'NOT_FOUND' },
    {
      response: json({ code: 'MD404', message: 'foreign chain internal detail' }, 400),
      code: 'NOT_FOUND',
    },
    {
      response: json({ code: '42501', message: 'actor internal detail' }, 400),
      code: 'FORBIDDEN',
    },
    {
      response: json({ code: 'MD422', message: 'note internal detail' }, 400),
      code: 'VALIDATION_FAILED',
    },
    {
      response: json({ code: 'P0001', message: 'zero-row internal detail' }, 500),
      code: 'INTERNAL',
    },
  ];
  const { setDocumentReview } = await load();

  for (const scenario of scenarios) {
    const calls = captureFetch(() => scenario.response.clone());
    await assert.rejects(
      () => setDocumentReview(VERSION, reviewCtx(), { status: 'approved' }),
      (err) =>
        err instanceof ApiError &&
        err.code === scenario.code &&
        !err.message.includes('internal detail'),
    );
    assert.equal(calls.length, 1);
    assert.equal(
      calls.some((call) => call.url.includes('/auth_events')),
      false,
    );
    assert.equal(
      calls.some((call) => call.url.includes('/tenant_audit_log')),
      false,
    );
  }
});
