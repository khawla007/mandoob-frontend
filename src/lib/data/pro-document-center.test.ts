process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ApiError } from '@/lib/errors';

type Module = typeof import('./pro-document-center');
let modulePromise: Promise<Module> | undefined;
const load = () => (modulePromise ??= import('./pro-document-center'));

const TENANT = '11111111-1111-4111-8111-111111111111';
const POSTGRES_TENANT = '00000000-0000-0000-0000-000000000001';
const CLIENT = '33333333-3333-4333-8333-333333333333';
const DOCUMENT = '44444444-4444-4444-8444-444444444444';
const ACTOR = '66666666-6666-4666-8666-666666666666';
const VERSION_1 = '77777777-7777-4777-8777-777777777777';
const VERSION_2 = '88888888-8888-4888-8888-888888888888';

test('document center data operations route failures through redacted structured logging', () => {
  const source = readFileSync(new URL('./pro-document-center.ts', import.meta.url), 'utf8');
  assert.match(source, /logSafeActionError/u);
  assert.doesNotMatch(source, /console\.error/u);
});

type FetchCall = { url: string; method: string; body: unknown; headers: Headers };
const originalFetch = globalThis.fetch;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function captureFetch(handler: (call: FetchCall) => Response | Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input, init) => {
    const requestLike = input as Request;
    const text = typeof init?.body === 'string' ? init.body : undefined;
    const call = {
      url: String(input),
      method: init?.method ?? requestLike.method ?? 'GET',
      body: text ? JSON.parse(text) : undefined,
      headers: new Headers(init?.headers ?? requestLike.headers),
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
    effective_page: 21,
    storage_path: 'must/not/leak.pdf',
    ...overrides,
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('searchDocumentCenterClientOptions bounds a 1001-client firm to stable tenant-scoped matches', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    company_name: `Client ${String(index).padStart(4, '0')}`,
  }));
  const calls = captureFetch(() => json(rows.slice(100, 150)));
  const loaded = await load();
  assert.equal(typeof loaded.searchDocumentCenterClientOptions, 'function');

  const options = await loaded.searchDocumentCenterClientOptions(TENANT, ' Client 1 ', 50);

  assert.equal(options.length, 50);
  assert.deepEqual(options[0], { id: rows[100].id, companyName: rows[100].company_name });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /select=id%2Ccompany_name/u);
  assert.match(calls[0].url, /tenant_id=eq\.11111111-1111-4111-8111-111111111111/u);
  assert.match(calls[0].url, /company_name=ilike\.%25Client\+1%25/u);
  assert.match(calls[0].url, /order=company_name\.asc%2Cid\.asc/u);
  assert.match(calls[0].url, /limit=50/u);
  assert.doesNotMatch(
    readFileSync(new URL('./pro-document-center.ts', import.meta.url), 'utf8'),
    /CLIENT_OPTION_BATCH_SIZE|\.range\(/u,
  );
});

test('document client search validates query and limit before reading', async () => {
  const calls = captureFetch(() => json([]));
  const loaded = await load();
  assert.equal(typeof loaded.searchDocumentCenterClientOptions, 'function');

  await assert.rejects(() => loaded.searchDocumentCenterClientOptions('not-a-tenant', '', 50));
  await assert.rejects(() => loaded.searchDocumentCenterClientOptions(TENANT, 'x'.repeat(101), 50));
  await assert.rejects(() => loaded.searchDocumentCenterClientOptions(TENANT, '', 51));
  assert.equal(calls.length, 0);
});

test('getDocumentCenterClientOption resolves one exact tenant-owned selected client', async () => {
  const selected = {
    id: '00000000-0000-4000-8000-000000000777',
    company_name: 'Selected Client',
  };
  const calls = captureFetch(() => json(selected));
  const loaded = await load();
  assert.equal(typeof loaded.getDocumentCenterClientOption, 'function');

  assert.deepEqual(await loaded.getDocumentCenterClientOption(TENANT, selected.id), {
    id: selected.id,
    companyName: selected.company_name,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /tenant_id=eq\.11111111-1111-4111-8111-111111111111/u);
  assert.match(calls[0].url, /id=eq\.00000000-0000-4000-8000-000000000777/u);
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
    effectivePage: 21,
  });
  assert.equal('storagePath' in result.rows[0], false);
});

test('document center accepts canonical PostgreSQL UUIDs used by trusted tenant rows', async () => {
  const calls = captureFetch(() => json([]));
  const { listProDocumentCenter } = await load();

  await listProDocumentCenter(POSTGRES_TENANT, {});

  assert.equal(calls.length, 1);
  assert.equal((calls[0].body as Record<string, unknown>).p_tenant_id, POSTGRES_TENANT);
});

test('listProDocumentCenter uses the RPC effective page with the exact total', async () => {
  const serverPage = Array.from({ length: 50 }, (_, index) =>
    rpcRow({
      entity_id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
      effective_page: 25,
    }),
  );
  const calls = captureFetch(() => json(serverPage));
  const { listProDocumentCenter } = await load();

  const result = await listProDocumentCenter(TENANT, { page: 1001 });

  assert.equal((calls[0].body as Record<string, unknown>).p_page, 1001);
  assert.equal((calls[0].body as Record<string, unknown>).p_page_size, 50);
  assert.equal(result.rows.length, 50, 'DAL must not slice an already paginated RPC response');
  assert.equal(result.total, 1234);
  assert.equal(result.page, 25);
  assert.ok(result.rows.every((row) => row.effectivePage === 25));
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

function historyVersion(overrides: Record<string, unknown> = {}) {
  return {
    versionId: VERSION_2,
    versionNumber: 2,
    current: true,
    uploadedAt: '2026-08-12T10:00:00.000Z',
    uploadedBy: ACTOR,
    uploaderName: 'Aisha',
    reviewStatus: 'approved',
    reviewedBy: ACTOR,
    reviewerName: 'Aisha',
    reviewedAt: '2026-08-12T11:00:00.000Z',
    reviewNote: 'Clear',
    sizeBytes: 200,
    mimeType: 'application/pdf',
    storagePath: 'must/not/leak.pdf',
    ...overrides,
  };
}

test('listDocumentVersionHistory makes one snapshot RPC and maps stable newest-first history', async () => {
  const calls = captureFetch(() =>
    json({
      documentId: DOCUMENT,
      currentVersionId: VERSION_2,
      total: 2,
      versions: [
        historyVersion(),
        historyVersion({
          versionId: VERSION_1,
          versionNumber: 1,
          current: false,
          uploadedAt: '2026-08-11T10:00:00.000Z',
          reviewStatus: 'rejected',
          reviewerName: 'Omar',
          reviewNote: 'Blurred',
          sizeBytes: 100,
        }),
      ],
    }),
  );
  const { listDocumentVersionHistory } = await load();

  const result = await listDocumentVersionHistory(TENANT, DOCUMENT);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/get_pro_document_version_history$/u);
  assert.deepEqual(calls[0].body, { p_tenant_id: TENANT, p_document_id: DOCUMENT });
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

test('listDocumentVersionHistory rejects malformed snapshot envelopes', async () => {
  const calls = captureFetch(() =>
    json({
      documentId: DOCUMENT,
      currentVersionId: VERSION_1,
      total: 2,
      versions: [historyVersion({ versionId: VERSION_1, versionNumber: 1 })],
    }),
  );
  const { listDocumentVersionHistory } = await load();

  await assert.rejects(
    () => listDocumentVersionHistory(TENANT, DOCUMENT),
    (error) => error instanceof ApiError && error.code === 'INTERNAL',
  );
  assert.equal(calls.length, 1);
});

test('listDocumentVersionHistory accepts retained versions when the document has no current head', async () => {
  const calls = captureFetch(() =>
    json({
      documentId: DOCUMENT,
      currentVersionId: null,
      total: 1,
      versions: [
        historyVersion({
          versionId: VERSION_1,
          versionNumber: 1,
          current: false,
        }),
      ],
    }),
  );
  const { listDocumentVersionHistory } = await load();

  const result = await listDocumentVersionHistory(TENANT, DOCUMENT);

  assert.equal(calls.length, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].versionId, VERSION_1);
  assert.equal(result[0].current, false);
  assert.equal(
    result.some((version) => version.current),
    false,
  );
});

test('listDocumentVersionHistory returns every 1001+ version from one immutable response snapshot', async () => {
  const total = 1001;
  const currentId = '00000000-0000-4000-8000-000000000750';
  const versions = Array.from({ length: total }, (_, index) => {
    const versionId = `00000000-0000-4000-8000-${String(total - index).padStart(12, '0')}`;
    return historyVersion({
      versionId,
      versionNumber: total - index,
      current: versionId === currentId,
      uploadedAt: new Date(Date.UTC(2026, 7, 12, 10, 0, 0) - index * 1000).toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      reviewerName: null,
      reviewNote: null,
      sizeBytes: index + 1,
    });
  });
  const lateBelowCursor = historyVersion({
    versionId: '99999999-9999-4999-8999-999999999999',
    uploadedAt: versions[500].uploadedAt,
  });
  const calls = captureFetch(() =>
    json({ documentId: DOCUMENT, currentVersionId: currentId, total, versions }),
  );
  const { listDocumentVersionHistory } = await load();

  const result = await listDocumentVersionHistory(TENANT, DOCUMENT);

  assert.equal(calls.length, 1, 'a late below-cursor insert cannot enter a second read snapshot');
  assert.equal(result.length, total);
  assert.equal(result[0].versionNumber, total);
  assert.equal(result.at(-1)?.versionNumber, 1);
  assert.equal(result.find((entry) => entry.versionId === currentId)?.current, true);
  assert.equal(
    result.some((entry) => entry.versionId === lateBelowCursor.versionId),
    false,
  );
  assert.equal(new Set(result.map((entry) => entry.versionId)).size, total);
});

test('listDocumentVersionHistory collapses missing and foreign ownership and sanitizes DB errors', async () => {
  const { listDocumentVersionHistory } = await load();
  for (const response of [json(null), json(null)]) {
    const calls = captureFetch(() => response);
    await assert.rejects(
      () => listDocumentVersionHistory(TENANT, DOCUMENT),
      (error) =>
        error instanceof ApiError &&
        error.code === 'NOT_FOUND' &&
        error.message === 'Document not found',
    );
    assert.equal(calls.length, 1);
  }

  const calls = captureFetch(() =>
    json({ message: 'secret storage_path and ownership detail' }, 500),
  );
  await assert.rejects(
    () => listDocumentVersionHistory(TENANT, DOCUMENT),
    (error) =>
      error instanceof ApiError &&
      error.code === 'INTERNAL' &&
      error.message === 'Unable to load document history',
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
        return json([{ document_id: DOCUMENT, client_id: CLIENT, expires_on: expiresOn }]);
      }
      return json([]);
    });

    const result = await setDocumentExpiry(expiryContext(), {
      document_id: DOCUMENT,
      expires_on: expiresOn,
    });

    assert.deepEqual(result, { clientId: CLIENT });

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

test('setDocumentExpiry maps only stable SQLSTATE outcomes and never exposes database messages', async () => {
  const { setDocumentExpiry } = await load();
  for (const expected of [
    {
      dbCode: '42501',
      dbMessage: 'private actor tenant role status details',
      code: 'FORBIDDEN',
      message: 'Document expiry update is not authorized',
      status: 403,
    },
    {
      dbCode: 'MD404',
      dbMessage: 'private document_scope_violation details',
      code: 'NOT_FOUND',
      message: 'Document not found',
      status: 404,
    },
    {
      dbCode: 'MD409',
      dbMessage: 'private expiry_externally_managed details',
      code: 'EXPIRY_EXTERNALLY_MANAGED',
      message: 'Expiry is managed by the linked client or employee',
      status: 409,
    },
  ]) {
    const calls = captureFetch((call) =>
      call.url.includes('/rest/v1/rpc/set_pro_document_expiry')
        ? json({ message: expected.dbMessage, code: expected.dbCode }, 400)
        : json([]),
    );

    await assert.rejects(
      () =>
        setDocumentExpiry(expiryContext(), {
          document_id: DOCUMENT,
          expires_on: '2027-08-13',
        }),
      (error) =>
        error instanceof ApiError &&
        error.code === expected.code &&
        error.message === expected.message &&
        error.status === expected.status &&
        !error.message.includes(expected.dbMessage),
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
