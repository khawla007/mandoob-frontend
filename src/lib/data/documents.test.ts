process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.VIRUSTOTAL_API_KEY = 'vt_test_key';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiError } from '@/lib/errors';

type DocumentsModule = typeof import('./documents');
let mod: DocumentsModule | null = null;
async function load(): Promise<DocumentsModule> {
  if (!mod) mod = await import('./documents');
  return mod;
}

const originalFetch = globalThis.fetch;

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POSTGRES_TENANT = '00000000-0000-0000-0000-000000000001';
const CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOCUMENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VERSION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ACTOR = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REQUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OPERATION = '55555555-5555-4555-8555-555555555555';
const GENERATED_FILENAME = '2026-08-14_m0abc123_0123456789ab_server-held.pdf';

test('document data operations route failures through redacted structured logging', () => {
  const source = readFileSync(new URL('./documents.ts', import.meta.url), 'utf8');
  assert.match(source, /logSafeActionError/u);
  assert.doesNotMatch(source, /console\.error/u);
});

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
    storage_path: `${TENANT}/${CLIENT}/passport/${GENERATED_FILENAME}`,
    document: {
      id: DOCUMENT,
      tenant_id: TENANT,
      company_id: CLIENT,
      request_id: REQUEST,
      current_version_id: VERSION,
      company: { id: CLIENT, tenant_id: TENANT },
      request: { id: REQUEST, tenant_id: TENANT, company_id: CLIENT },
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
    companyId: '22222222-2222-4222-8222-222222222222',
    docType: 'passport' as const,
    requestId: '33333333-3333-4333-8333-333333333333',
    label: 'Passport',
    operationId: OPERATION,
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

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('uploadDocument delegates the exact authority and file input to the audited coordinator', async () => {
  const received: unknown[] = [];
  const input = uploadInput(pdfWith('coordinated upload'));
  const { uploadDocument } = await load();

  const result = await uploadDocument(input, async (coordinatorInput) => {
    received.push(coordinatorInput);
    return {
      status: 'finalized',
      operationId: OPERATION,
      documentId: DOCUMENT,
      versionId: VERSION,
    };
  });

  assert.deepEqual(result, { documentId: DOCUMENT, versionId: VERSION });
  assert.deepEqual(received, [
    {
      tenantId: input.tenantId,
      companyId: input.companyId,
      operationId: OPERATION,
      actorId: input.actor.id,
      requestId: input.requestId,
      documentId: null,
      employeeId: null,
      docType: input.docType,
      label: input.label,
      expectedHead: null,
      file: {
        data: input.file.data,
        filename: input.file.originalName,
        mimeType: input.file.mimeType,
      },
    },
  ]);
});

test('uploadDocument binds an Employee upload to the authoritative own employee record', async () => {
  const received: unknown[] = [];
  const employeeId = '66666666-6666-4666-8666-666666666666';
  const input = {
    ...uploadInput(pdfWith('employee coordinated upload')),
    employeeId,
    actor: {
      id: '44444444-4444-4444-8444-444444444444',
      role: 'employee' as const,
      ip: '127.0.0.1',
      userAgent: 'node-test',
    },
  };
  const { uploadDocument } = await load();

  await uploadDocument(input, async (coordinatorInput) => {
    received.push(coordinatorInput);
    return {
      status: 'finalized',
      operationId: OPERATION,
      documentId: DOCUMENT,
      versionId: VERSION,
    };
  });

  assert.equal((received[0] as { employeeId: string }).employeeId, employeeId);
});

test('uploadDocument has no legacy scan, storage, or manual document write path', () => {
  const source = readFileSync(new URL('./documents.ts', import.meta.url), 'utf8');
  const body = source.slice(
    source.indexOf('export async function uploadDocument'),
    source.indexOf('export type DocumentListEntry'),
  );
  assert.doesNotMatch(body, /scanFile|\.storage\.|\.from\('documents'\)|document_versions/u);
  assert.match(body, /coordinateDocumentUpload/u);
});

test('getCompanyDocumentSignedUrl rejects invalid UUIDs and a missing version before DAL signing', async () => {
  const calls = captureFetch(() => json(null));
  const { getCompanyDocumentSignedUrl: getDocumentSignedUrl } = await load();
  let signCalls = 0;
  const signer = async () => {
    signCalls += 1;
    return { url: 'https://storage.test/signed', expiresAt: '2026-08-14T12:05:00.000Z' };
  };

  await assert.rejects(
    () => getDocumentSignedUrl('not-a-uuid', TENANT, CLIENT, VERSION, 300, signer),
    (err) => err instanceof ApiError && err.code === 'VALIDATION_FAILED',
  );
  assert.equal(calls.length, 0);

  await assert.rejects(
    () => getDocumentSignedUrl(ACTOR, TENANT, CLIENT, VERSION, 300, signer),
    (err) => err instanceof ApiError && err.code === 'NOT_FOUND',
  );
  assert.equal(calls.length, 1);
  assert.equal(signCalls, 0);
});

test('getCompanyDocumentSignedUrl validates TTL before metadata or DAL I/O', async () => {
  const calls = captureFetch(() => json(null));
  const { getCompanyDocumentSignedUrl: getDocumentSignedUrl } = await load();
  const signer = async () => {
    assert.fail('signer called for an invalid lifetime');
  };

  for (const ttl of [-1, 0, 301, Number.POSITIVE_INFINITY, Number.NaN, 1.5]) {
    await assert.rejects(
      () => getDocumentSignedUrl(ACTOR, TENANT, CLIENT, VERSION, ttl, signer),
      (err) => err instanceof ApiError && err.code === 'VALIDATION_FAILED',
    );
  }

  assert.equal(calls.length, 0);
});

test('getCompanyDocumentSignedUrl derives the document ID and forwards exact server authority to the DAL', async () => {
  const calls = captureFetch(() => json(ownedVersion()));
  const received: unknown[] = [];
  const providerExpiry = '2026-08-14T12:04:17.000Z';
  const { getCompanyDocumentSignedUrl } = await load();

  const result = await getCompanyDocumentSignedUrl(
    ACTOR.toUpperCase(),
    TENANT.toUpperCase(),
    CLIENT.toUpperCase(),
    VERSION.toUpperCase(),
    257,
    async (input) => {
      received.push(input);
      return { url: 'https://storage.test/signed', expiresAt: providerExpiry };
    },
  );

  assert.deepEqual(result, { url: 'https://storage.test/signed', expiresAt: providerExpiry });
  assert.deepEqual(received, [
    {
      actorId: ACTOR,
      tenantId: TENANT,
      companyId: CLIENT,
      documentId: DOCUMENT,
      versionId: VERSION,
      lifetimeSeconds: 257,
    },
  ]);
  assert.equal(calls.length, 1);
  const select = new URL(calls[0].url).searchParams.get('select');
  assert.ok(select);
  assert.match(
    select,
    /document:documents!document_versions_document_id_fkey!inner\(id,\s*tenant_id,\s*company_id\)/u,
  );
  assert.doesNotMatch(select, /storage_path|sha256|uploaded_by/u);
  assert.equal(new URL(calls[0].url).searchParams.get('id'), `eq.${VERSION}`);
  assert.equal(
    calls.some((call) => call.url.includes('/storage/v1/object/sign/')),
    false,
  );
});

test('getCompanyDocumentSignedUrl rejects ownership mismatches before the DAL', async () => {
  const foreignTenant = '99999999-9999-4999-8999-999999999999';
  const mismatches = [
    ownedVersion({ tenant_id: foreignTenant }),
    ownedVersion({ document: { ...ownedVersion().document, tenant_id: foreignTenant } }),
    ownedVersion({
      document: {
        ...ownedVersion().document,
        company_id: foreignTenant,
      },
    }),
  ];
  let index = 0;
  const calls = captureFetch(() => json(mismatches[index++]));
  const { getCompanyDocumentSignedUrl: getDocumentSignedUrl } = await load();
  let signCalls = 0;

  for (const mismatch of mismatches) {
    void mismatch;
    await assert.rejects(
      () =>
        getDocumentSignedUrl(ACTOR, TENANT, CLIENT, VERSION, 300, async () => {
          signCalls += 1;
          return { url: 'https://storage.test/signed', expiresAt: '2026-08-14T12:05:00.000Z' };
        }),
      (err) => err instanceof ApiError && err.code === 'NOT_FOUND',
    );
  }

  assert.equal(calls.length, mismatches.length);
  assert.equal(signCalls, 0);
});

test('getCompanyDocumentSignedUrl sanitizes metadata failures and preserves sanitized DAL errors', async () => {
  const { getCompanyDocumentSignedUrl: getDocumentSignedUrl } = await load();
  captureFetch(() => json({ code: 'XX000', message: 'secret database detail' }, 500));
  await assert.rejects(
    () => getDocumentSignedUrl(ACTOR, TENANT, CLIENT, VERSION),
    (err) =>
      err instanceof ApiError &&
      err.code === 'INTERNAL' &&
      !err.message.includes('secret database detail'),
  );

  captureFetch(() => json(ownedVersion()));
  const safeDalError = new ApiError(
    'DOCUMENT_ACCESS_FAILED',
    'Document access could not be completed',
    503,
  );
  await assert.rejects(
    () =>
      getDocumentSignedUrl(ACTOR, TENANT, CLIENT, VERSION, 300, async () => {
        throw safeDalError;
      }),
    (err) => err === safeDalError,
  );
});

test('getDocumentSignedUrl derives authoritative company and document IDs before DAL signing', async () => {
  captureFetch(() => json(ownedVersion()));
  const { getDocumentSignedUrl } = await load();
  let input: unknown;
  const signed = await getDocumentSignedUrl(ACTOR, TENANT, VERSION, 300, async (value) => {
    input = value;
    return { url: 'https://storage.test/signed', expiresAt: '2026-08-14T12:04:13.000Z' };
  });
  assert.equal(signed.expiresAt, '2026-08-14T12:04:13.000Z');
  assert.deepEqual(input, {
    actorId: ACTOR,
    tenantId: TENANT,
    companyId: CLIENT,
    documentId: DOCUMENT,
    versionId: VERSION,
    lifetimeSeconds: 300,
  });
});

test('setDocumentReview validates role, UUID, and required rejection note before I/O', async () => {
  const calls = captureFetch(() => json(null));
  const { setDocumentReview } = await load();

  await assert.rejects(
    () =>
      setDocumentReview(
        CLIENT,
        VERSION,
        { ...reviewCtx(), role: 'customer' as never },
        { status: 'approved' },
      ),
    (err) => err instanceof ApiError && err.code === 'FORBIDDEN',
  );
  await assert.rejects(() =>
    setDocumentReview(CLIENT, 'bad-id', reviewCtx(), { status: 'approved' }),
  );
  for (const note of ['   ', '\u00a0', '\ufeff', '\u00a0\ufeff']) {
    await assert.rejects(() =>
      setDocumentReview(CLIENT, VERSION, reviewCtx(), { status: 'rejected', note }),
    );
  }
  assert.equal(calls.length, 0);
});

test('setDocumentReview verifies assigned-company ownership before its atomic RPC and telemetry', async () => {
  const calls = captureFetch((call) => {
    if (call.url.includes('/rest/v1/document_versions?')) return json(ownedVersion());
    if (call.url.endsWith('/rest/v1/rpc/review_document_version')) {
      return json({
        document_id: DOCUMENT,
        company_id: CLIENT,
        fulfilled_request_id: REQUEST,
        review_status: 'approved',
      });
    }
    if (call.url.includes('/rest/v1/auth_events')) return json(null, 201);
    return json({ message: 'legacy write attempted' }, 500);
  });
  const { setDocumentReview } = await load();

  const result = await setDocumentReview(CLIENT, VERSION, reviewCtx(), {
    status: 'approved',
    note: ' looks good ',
  });

  assert.deepEqual(result, { companyId: CLIENT });

  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /\/rest\/v1\/document_versions\?/u);
  assert.match(calls[1].url, /\/rest\/v1\/rpc\/review_document_version$/u);
  assert.deepEqual(calls[1].body, {
    p_tenant_id: TENANT,
    p_actor_id: ACTOR,
    p_version_id: VERSION,
    p_status: 'approved',
    p_note: 'looks good',
    p_reviewed_at: (calls[1].body as Record<string, unknown>).p_reviewed_at,
  });
  assert.equal(
    Number.isNaN(Date.parse((calls[1].body as Record<string, string>).p_reviewed_at)),
    false,
  );
  assert.match(calls[2].url, /\/rest\/v1\/auth_events$/u);
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
  assert.match(calls[0].url, new RegExp(`tenant_id=eq\\.${TENANT}`, 'u'));
});

test('setDocumentReview supports rejection through the RPC without fulfilling a request', async () => {
  const calls = captureFetch((call) => {
    if (call.url.includes('/rest/v1/document_versions?')) return json(ownedVersion());
    if (call.url.endsWith('/rest/v1/rpc/review_document_version')) {
      return json({
        document_id: DOCUMENT,
        company_id: CLIENT,
        fulfilled_request_id: null,
        review_status: 'rejected',
      });
    }
    return json(null, 201);
  });
  const { setDocumentReview } = await load();

  await setDocumentReview(CLIENT, VERSION, reviewCtx(), {
    status: 'rejected',
    note: 'Unreadable',
  });

  assert.equal((calls[1].body as Record<string, unknown>).p_status, 'rejected');
  assert.equal((calls[1].body as Record<string, unknown>).p_note, 'Unreadable');
  assert.equal(
    calls.some((call) => call.url.includes('/document_requests')),
    false,
  );
});

test('setDocumentReview normalizes uppercase UUIDs in the RPC and success telemetry', async () => {
  const calls = captureFetch((call) => {
    if (call.url.includes('/rest/v1/document_versions?')) return json(ownedVersion());
    if (call.url.endsWith('/rest/v1/rpc/review_document_version')) {
      return json({
        document_id: DOCUMENT,
        company_id: CLIENT,
        fulfilled_request_id: null,
        review_status: 'approved',
      });
    }
    return json(null, 201);
  });
  const { setDocumentReview } = await load();

  await setDocumentReview(
    CLIENT,
    VERSION.toUpperCase(),
    {
      ...reviewCtx(),
      tenantId: TENANT.toUpperCase(),
      actorId: ACTOR.toUpperCase(),
    },
    { status: 'approved' },
  );

  assert.deepEqual(
    {
      p_tenant_id: (calls[1].body as Record<string, unknown>).p_tenant_id,
      p_actor_id: (calls[1].body as Record<string, unknown>).p_actor_id,
      p_version_id: (calls[1].body as Record<string, unknown>).p_version_id,
    },
    { p_tenant_id: TENANT, p_actor_id: ACTOR, p_version_id: VERSION },
  );
  assert.equal((calls[2].body as Record<string, unknown>).actor_user_id, ACTOR);
  assert.equal((calls[2].body as Record<string, unknown>).tenant_id, TENANT);
  assert.deepEqual((calls[2].body as Record<string, unknown>).details, {
    entity: 'document',
    op: 'review',
    version_id: VERSION,
    document_id: DOCUMENT,
    review_status: 'approved',
  });
});

test('createDocumentRequest canonicalizes ownership UUIDs and returns authoritative company ID', async () => {
  const calls = captureFetch((call) => {
    if (call.url.includes('/rest/v1/company_profiles?')) {
      return json({ id: CLIENT, tenant_id: TENANT });
    }
    if (call.url.includes('/rest/v1/document_requests')) return json({ id: REQUEST });
    if (call.url.includes('/rest/v1/customer_profiles')) return json(null);
    if (call.url.includes('/rest/v1/tenants')) return json({ name: 'Acme' });
    return json(null, 201);
  });
  const { createDocumentRequest } = await load();
  const result = await createDocumentRequest(
    {
      ...reviewCtx(),
      tenantId: TENANT.toUpperCase(),
      actorId: ACTOR.toUpperCase(),
    },
    { company_id: CLIENT.toUpperCase(), doc_type: 'passport', label: 'Passport copy' },
  );

  assert.deepEqual(result, { id: REQUEST, companyId: CLIENT });
  const clientRead = calls.find((call) => call.url.includes('/rest/v1/company_profiles?'))!;
  assert.match(clientRead.url, new RegExp(`id=eq\\.${CLIENT}`, 'u'));
  const insert = calls.find((call) => call.url.includes('/rest/v1/document_requests'))!;
  assert.equal((insert.body as Record<string, unknown>).tenant_id, TENANT);
  assert.equal((insert.body as Record<string, unknown>).company_id, CLIENT);
  assert.equal((insert.body as Record<string, unknown>).requested_by, ACTOR);
});

test('createDocumentRequest accepts canonical PostgreSQL UUIDs from trusted tenant context', async () => {
  const calls = captureFetch((call) => {
    if (call.url.includes('/rest/v1/company_profiles?')) {
      return json({ id: CLIENT, tenant_id: POSTGRES_TENANT });
    }
    if (call.url.includes('/rest/v1/document_requests')) return json({ id: REQUEST });
    if (call.url.includes('/rest/v1/customer_profiles')) return json(null);
    if (call.url.includes('/rest/v1/tenants')) return json({ name: 'Acme' });
    return json(null, 201);
  });
  const { createDocumentRequest } = await load();

  const result = await createDocumentRequest(
    { ...reviewCtx(), tenantId: POSTGRES_TENANT },
    { company_id: CLIENT, doc_type: 'insurance_policy', label: 'Insurance policy' },
  );

  assert.deepEqual(result, { id: REQUEST, companyId: CLIENT });
  const insert = calls.find((call) => call.url.includes('/rest/v1/document_requests'))!;
  assert.equal((insert.body as Record<string, unknown>).tenant_id, POSTGRES_TENANT);
});

test('createDocumentRequest hides whether a company exists outside the tenant', async () => {
  const { createDocumentRequest } = await load();
  const input = { company_id: CLIENT, doc_type: 'passport' as const, label: 'Passport copy' };

  for (const companyRow of [null, { id: CLIENT, tenant_id: DOCUMENT }]) {
    const calls = captureFetch((call) => {
      if (call.url.includes('/rest/v1/company_profiles?')) return json(companyRow);
      return json({ message: 'unexpected write' }, 500);
    });

    await assert.rejects(
      () => createDocumentRequest(reviewCtx(), input),
      (error) =>
        error instanceof ApiError &&
        error.code === 'NOT_FOUND' &&
        error.status === 404 &&
        error.message === 'company not found',
    );
    assert.equal(calls.length, 1);
  }
});

test('setDocumentReview maps controlled and zero-row RPC failures without telemetry or raw details', async () => {
  const scenarios = [
    { response: json(null), code: 'NOT_FOUND', status: 404 },
    {
      response: json({ code: 'MD404', message: 'foreign chain internal detail' }, 400),
      code: 'NOT_FOUND',
      status: 404,
    },
    {
      response: json({ code: '42501', message: 'actor internal detail' }, 400),
      code: 'FORBIDDEN',
      status: 403,
    },
    {
      response: json({ code: 'MD422', message: 'note internal detail' }, 400),
      code: 'VALIDATION_FAILED',
      status: 400,
    },
    {
      response: json({ code: 'MD409', message: 'document_review_conflict' }, 400),
      code: 'VALIDATION_FAILED',
      status: 409,
    },
    {
      response: json({ code: 'P0001', message: 'zero-row internal detail' }, 500),
      code: 'INTERNAL',
      status: 500,
    },
  ];
  const { setDocumentReview } = await load();

  for (const scenario of scenarios) {
    const calls = captureFetch((call) =>
      call.url.includes('/rest/v1/document_versions?')
        ? json(ownedVersion())
        : scenario.response.clone(),
    );
    await assert.rejects(
      () => setDocumentReview(CLIENT, VERSION, reviewCtx(), { status: 'approved' }),
      (err) =>
        err instanceof ApiError &&
        err.code === scenario.code &&
        err.status === scenario.status &&
        !err.message.includes('internal detail'),
    );
    assert.equal(calls.length, 2);
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

test('setDocumentReview rejects a same-tenant foreign Company before the review RPC', async () => {
  const foreignCompany = '99999999-9999-4999-8999-999999999999';
  const calls = captureFetch(() =>
    json(
      ownedVersion({
        document: {
          ...ownedVersion().document,
          company_id: foreignCompany,
          company: { id: foreignCompany, tenant_id: TENANT },
          request: { id: REQUEST, tenant_id: TENANT, company_id: foreignCompany },
        },
      }),
    ),
  );
  const { setDocumentReview } = await load();

  await assert.rejects(
    () => setDocumentReview(CLIENT, VERSION, reviewCtx(), { status: 'approved' }),
    (error) => error instanceof ApiError && error.code === 'NOT_FOUND',
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls.some((call) => call.url.includes('/rpc/review_document_version')),
    false,
  );
});

test('setDocumentReview sanitizes assigned-company ownership read failures', async () => {
  const calls = captureFetch(() =>
    json({ code: 'XX000', message: 'private ownership detail' }, 500),
  );
  const { setDocumentReview } = await load();

  await assert.rejects(
    () => setDocumentReview(CLIENT, VERSION, reviewCtx(), { status: 'approved' }),
    (error) =>
      error instanceof ApiError &&
      error.code === 'INTERNAL' &&
      !error.message.includes('private ownership detail'),
  );
  assert.equal(calls.length, 1);
});
