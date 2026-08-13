process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/lib/errors';

type Module = typeof import('./pro-document-center');
let modulePromise: Promise<Module> | undefined;
const load = () => (modulePromise ??= import('./pro-document-center'));

const TENANT = '11111111-1111-4111-8111-111111111111';
const FOREIGN_TENANT = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';
const DOCUMENT = '44444444-4444-4444-8444-444444444444';
const ACTOR = '66666666-6666-4666-8666-666666666666';
const VERSION_1 = '77777777-7777-4777-8777-777777777777';
const VERSION_2 = '88888888-8888-4888-8888-888888888888';

type FetchCall = { url: string; method: string; body: unknown; headers: Headers };
const originalFetch = globalThis.fetch;

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
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    entity_kind: 'document',
    entity_id: DOCUMENT,
    tenant_id: TENANT,
    client_id: CLIENT,
    client_name: 'Acme LLC',
    client_status: 'active',
    employee_id: null,
    employee_name: null,
    doc_type: 'passport',
    label: 'Director passport',
    request_id: null,
    request_status: null,
    due_at: null,
    requested_by: null,
    requested_by_name: 'Aisha',
    document_id: DOCUMENT,
    current_version_id: VERSION_1,
    current_version_created_at: '2026-08-12T09:00:00.000Z',
    current_version_mime_type: 'application/pdf',
    current_version_size_bytes: 2048,
    review_status: 'pending',
    review_note: null,
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    effective_expires_on: '2027-08-12',
    expiry_source: 'document',
    created_at: '2026-08-12T09:00:00.000Z',
    total_count: 1234,
    storage_path: 'must/not/leak.pdf',
    ...overrides,
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('listProDocumentCenter sends exact validated filters to only the RPC and maps without storage paths', async () => {
  const calls = captureFetch(() => json([rpcRow()]));
  const { listProDocumentCenter } = await load();

  const result = await listProDocumentCenter(TENANT, {
    view: 'submitted',
    sort: 'newest',
    window: 'all',
    search: 'passport',
    clientId: CLIENT,
    docType: 'passport',
    from: '2026-08-01',
    to: '2026-08-31',
    focus: { kind: 'document', id: DOCUMENT },
    page: 21,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/list_pro_document_center$/u);
  assert.deepEqual(calls[0].body, {
    p_tenant_id: TENANT,
    p_view: 'submitted',
    p_search: 'passport',
    p_client_id: CLIENT,
    p_doc_type: 'passport',
    p_due_from: null,
    p_due_to: null,
    p_expiry_from: '2026-08-01',
    p_expiry_to: '2026-08-31',
    p_sort: 'newest',
    p_focus_kind: 'document',
    p_focus_id: DOCUMENT,
    p_page: 21,
    p_page_size: 50,
  });
  assert.equal(result.total, 1234);
  assert.equal(result.page, 21);
  assert.equal(result.pageSize, 50);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    entityKind: 'document',
    entityId: DOCUMENT,
    tenantId: TENANT,
    clientId: CLIENT,
    clientCompany: 'Acme LLC',
    clientStatus: 'active',
    employeeId: null,
    employeeName: null,
    docType: 'passport',
    label: 'Director passport',
    requestId: null,
    requestStatus: null,
    dueAt: null,
    requestedBy: null,
    requesterName: 'Aisha',
    documentId: DOCUMENT,
    versionId: VERSION_1,
    uploadedAt: '2026-08-12T09:00:00.000Z',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    reviewStatus: 'pending',
    reviewNote: null,
    reviewedBy: null,
    reviewerName: null,
    reviewedAt: null,
    expiresOn: '2027-08-12',
    expirySource: 'document',
    createdAt: '2026-08-12T09:00:00.000Z',
    totalCount: 1234,
  });
  assert.equal('storagePath' in result.rows[0], false);
});

test('listProDocumentCenter preserves page 1001, exact total, and all server-returned rows', async () => {
  const serverPage = Array.from({ length: 50 }, (_, index) =>
    rpcRow({ entity_id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111` }),
  );
  const calls = captureFetch(() => json(serverPage));
  const { listProDocumentCenter } = await load();

  const result = await listProDocumentCenter(TENANT, { page: 1001 });

  assert.equal((calls[0].body as Record<string, unknown>).p_page, 1001);
  assert.equal((calls[0].body as Record<string, unknown>).p_page_size, 50);
  assert.equal(result.rows.length, 50, 'DAL must not slice an already paginated RPC response');
  assert.equal(result.total, 1234);
});

test('listProDocumentCenter returns total zero for an empty RPC result and sanitizes DB failures', async () => {
  const { listProDocumentCenter } = await load();
  captureFetch(() => json([]));
  assert.deepEqual(await listProDocumentCenter(TENANT, {}), {
    rows: [],
    total: 0,
    page: 1,
    pageSize: 50,
  });

  captureFetch(() => json({ message: 'secret storage_path and SQL detail' }, 500));
  await assert.rejects(
    () => listProDocumentCenter(TENANT, {}),
    (error) =>
      error instanceof ApiError &&
      error.code === 'INTERNAL' &&
      error.message === 'Unable to load document center',
  );
});

test('getDocumentCenterSummary isolates each RPC result when one source fails', async () => {
  const totals: Record<string, number> = {
    requested: 11,
    submitted: 12,
    approved: 13,
    rejected: 14,
    expiring: 15,
    overdue: 16,
  };
  const calls = captureFetch((call) => {
    const view = (call.body as Record<string, string>).p_view;
    return view === 'submitted'
      ? json({ message: 'one source failed' }, 500)
      : json([rpcRow({ total_count: totals[view] })]);
  });
  const { getDocumentCenterSummary } = await load();

  const result = await getDocumentCenterSummary(TENANT, '2026-08-13');

  assert.deepEqual(result, {
    awaitingUpload: { ok: true, value: 11 },
    awaitingReview: { ok: false },
    approved: { ok: true, value: 13 },
    rejected: { ok: true, value: 14 },
    expiring: { ok: true, value: 15 },
    overdue: { ok: true, value: 16 },
  });
  assert.equal(calls.length, 6);
  for (const call of calls) {
    const body = call.body as Record<string, unknown>;
    assert.equal(body.p_tenant_id, TENANT);
    assert.equal(body.p_page, 1);
    assert.equal(body.p_page_size, 1);
  }
  const expiring = calls.find(
    (call) => (call.body as Record<string, unknown>).p_view === 'expiring',
  )!;
  assert.equal((expiring.body as Record<string, unknown>).p_expiry_from, '2026-08-13');
  assert.equal((expiring.body as Record<string, unknown>).p_expiry_to, '2026-09-12');
});

test('listDocumentVersionHistory proves ownership first and returns stable newest-first history', async () => {
  const calls = captureFetch((call) => {
    if (call.url.includes('/rest/v1/documents?')) {
      return json([
        {
          id: DOCUMENT,
          tenant_id: TENANT,
          client_id: CLIENT,
          current_version_id: VERSION_2,
          clients: { id: CLIENT, tenant_id: TENANT },
          employees: null,
        },
      ]);
    }
    if (call.url.includes('/rest/v1/document_versions?')) {
      return json([
        {
          id: VERSION_2,
          document_id: DOCUMENT,
          tenant_id: TENANT,
          mime_type: 'application/pdf',
          size_bytes: 200,
          uploaded_by: ACTOR,
          review_status: 'approved',
          review_note: 'Clear',
          reviewed_by: ACTOR,
          reviewed_at: '2026-08-12T11:00:00Z',
          created_at: '2026-08-12T10:00:00Z',
          uploader: { full_name: 'Aisha' },
          reviewer: { full_name: 'Aisha' },
          storage_path: 'private/latest.pdf',
        },
        {
          id: VERSION_1,
          document_id: DOCUMENT,
          tenant_id: TENANT,
          mime_type: 'application/pdf',
          size_bytes: 100,
          uploaded_by: ACTOR,
          review_status: 'rejected',
          review_note: 'Blurred',
          reviewed_by: ACTOR,
          reviewed_at: '2026-08-11T11:00:00Z',
          created_at: '2026-08-11T10:00:00Z',
          uploader: { full_name: 'Aisha' },
          reviewer: { full_name: 'Omar' },
          storage_path: 'private/old.pdf',
        },
      ]);
    }
    return json({ message: 'unexpected request' }, 500);
  });
  const { listDocumentVersionHistory } = await load();

  const result = await listDocumentVersionHistory(TENANT, DOCUMENT);

  assert.match(calls[0].url, /\/rest\/v1\/documents\?/u);
  assert.match(calls[1].url, /\/rest\/v1\/document_versions\?/u);
  const order = new URL(calls[1].url).searchParams.get('order');
  assert.equal(order, 'created_at.desc,id.desc');
  assert.deepEqual(
    result.map((row) => ({ id: row.versionId, version: row.versionNumber, current: row.current })),
    [
      { id: VERSION_2, version: 2, current: true },
      { id: VERSION_1, version: 1, current: false },
    ],
  );
  assert.equal(result[0].uploaderName, 'Aisha');
  assert.equal(result[1].reviewerName, 'Omar');
  assert.equal('storagePath' in result[0], false);
});

test('listDocumentVersionHistory batches beyond the provider cap with exact global numbering', async () => {
  const total = 1001;
  const currentId = '00000000-0000-4000-8000-000000000750';
  const versions = Array.from({ length: total }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    document_id: DOCUMENT,
    tenant_id: TENANT,
    mime_type: 'application/pdf',
    size_bytes: index + 1,
    uploaded_by: ACTOR,
    review_status: 'approved',
    review_note: null,
    reviewed_by: ACTOR,
    reviewed_at: '2026-08-12T11:00:00Z',
    created_at: new Date(Date.UTC(2026, 7, 12, 10, 0, 0) - index * 1000).toISOString(),
    uploader: { full_name: 'Aisha' },
    reviewer: { full_name: 'Omar' },
  }));
  const calls = captureFetch((call) => {
    if (call.url.includes('/rest/v1/documents?')) {
      return json([
        {
          id: DOCUMENT,
          tenant_id: TENANT,
          client_id: CLIENT,
          current_version_id: currentId,
          clients: { id: CLIENT, tenant_id: TENANT },
          employees: null,
        },
      ]);
    }
    const url = new URL(call.url);
    const from = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    assert.equal(Number.isInteger(from), true);
    assert.equal(limit, 500);
    const to = from + limit - 1;
    return Response.json(versions.slice(from, to + 1), {
      status: 206,
      headers: { 'content-range': `${from}-${Math.min(to, total - 1)}/${total}` },
    });
  });
  const { listDocumentVersionHistory } = await load();

  const result = await listDocumentVersionHistory(TENANT, DOCUMENT);

  const versionCalls = calls.filter((call) => call.url.includes('/rest/v1/document_versions?'));
  assert.ok(versionCalls.length >= 2);
  assert.equal(result.length, total);
  assert.equal(result[0].versionNumber, total);
  assert.equal(result.at(-1)?.versionNumber, 1);
  assert.equal(result.find((entry) => entry.versionId === currentId)?.current, true);
  assert.equal(new URL(versionCalls[0].url).searchParams.get('order'), 'created_at.desc,id.desc');
  assert.deepEqual(
    versionCalls.map((call) => new URL(call.url).searchParams.get('offset')),
    ['0', '500', '1000'],
  );
});

test('listDocumentVersionHistory stops after a missing or foreign ownership chain', async () => {
  const { listDocumentVersionHistory } = await load();
  let calls = captureFetch(() => json([]));
  await assert.rejects(
    () => listDocumentVersionHistory(TENANT, DOCUMENT),
    (error) => error instanceof ApiError && error.code === 'NOT_FOUND',
  );
  assert.equal(calls.length, 1);

  calls = captureFetch(() =>
    json([
      {
        id: DOCUMENT,
        tenant_id: FOREIGN_TENANT,
        client_id: CLIENT,
        current_version_id: VERSION_1,
        clients: { id: CLIENT, tenant_id: FOREIGN_TENANT },
        employees: null,
      },
    ]),
  );
  await assert.rejects(
    () => listDocumentVersionHistory(TENANT, DOCUMENT),
    (error) => error instanceof ApiError && error.code === 'FORBIDDEN',
  );
  assert.equal(calls.length, 1);
});

function expiryContext() {
  return {
    tenantId: TENANT,
    actorId: ACTOR,
    role: 'pro' as const,
    ip: '203.0.113.77',
    userAgent: 'node-test',
  };
}

test('setDocumentExpiry rejects an omitted expiry before any read or mutation', async () => {
  const calls = captureFetch(() => json([]));
  const { setDocumentExpiry } = await load();

  await assert.rejects(() =>
    setDocumentExpiry(expiryContext(), { document_id: DOCUMENT } as never),
  );
  assert.equal(calls.length, 0);
});

test('setDocumentExpiry uses one transactional RPC for update and tenant audit, then records auth telemetry', async () => {
  const { setDocumentExpiry } = await load();
  for (const expiresOn of ['2027-08-13', null]) {
    const calls = captureFetch((call) => {
      if (call.url.includes('/rest/v1/rpc/set_pro_document_expiry')) {
        return json([{ document_id: DOCUMENT, expires_on: expiresOn }]);
      }
      return json([]);
    });

    await setDocumentExpiry(expiryContext(), {
      document_id: DOCUMENT,
      expires_on: expiresOn,
    });

    const rpc = calls.find((call) => call.url.includes('/rest/v1/rpc/set_pro_document_expiry'))!;
    assert.deepEqual(rpc.body, {
      p_tenant_id: TENANT,
      p_document_id: DOCUMENT,
      p_actor_id: ACTOR,
      p_expires_on: expiresOn,
    });
    assert.equal(
      calls.some((call) => call.url.includes('/rest/v1/documents?')),
      false,
    );
    assert.equal(
      calls.some((call) => call.url.includes('/rest/v1/tenant_audit_log')),
      false,
    );
    const auth = calls.find((call) => call.url.includes('/rest/v1/auth_events'))!;
    assert.equal((auth.body as Record<string, unknown>).kind, 'tenant_self_updated');
    assert.equal((auth.body as Record<string, unknown>).tenant_id, TENANT);
  }
});

test('setDocumentExpiry rejects empty and failed transactional RPCs without success telemetry', async () => {
  const { setDocumentExpiry } = await load();
  for (const response of [
    json([]),
    json({ message: 'private audit constraint detail', code: '23514' }, 500),
  ]) {
    const calls = captureFetch((call) =>
      call.url.includes('/rest/v1/rpc/set_pro_document_expiry') ? response : json([]),
    );

    await assert.rejects(
      () =>
        setDocumentExpiry(expiryContext(), {
          document_id: DOCUMENT,
          expires_on: '2027-08-13',
        }),
      (error) =>
        error instanceof ApiError &&
        error.code === 'INTERNAL' &&
        error.message === 'Unable to update document expiry',
    );
    assert.equal(calls.length, 1);
    assert.equal(
      calls.some((call) => call.url.includes('/rest/v1/auth_events')),
      false,
    );
  }
});

test('Dubai helpers use inclusive today-through-30 and the Dubai midnight boundary', async () => {
  const { dubaiToday, isExpiringWithin30 } = await load();
  assert.equal(dubaiToday(new Date('2026-08-13T19:59:59.999Z')), '2026-08-13');
  assert.equal(dubaiToday(new Date('2026-08-13T20:00:00.000Z')), '2026-08-14');
  assert.equal(isExpiringWithin30('2026-08-13', '2026-08-13'), true);
  assert.equal(isExpiringWithin30('2026-09-12', '2026-08-13'), true);
  assert.equal(isExpiringWithin30('2026-09-13', '2026-08-13'), false);
  assert.equal(isExpiringWithin30('2026-08-12', '2026-08-13'), false);
});
