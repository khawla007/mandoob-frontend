import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCustomerDocumentCenterSupabaseStore,
  groupCustomerSubmittedDocuments,
  loadCustomerDocumentCenter,
  type CustomerDocumentCenterStore,
} from './customer-document-center';

test('submitted documents group by type without reordering records inside a group', () => {
  const grouped = groupCustomerSubmittedDocuments([
    { id: 'one', docType: 'passport' },
    { id: 'two', docType: 'trade_license' },
    { id: 'three', docType: 'passport' },
  ] as never);
  assert.deepEqual(
    grouped.map((group) => [group.docType, group.documents.map((document) => document.id)]),
    [
      ['passport', ['one', 'three']],
      ['trade_license', ['two']],
    ],
  );
});

const access = {
  kind: 'authorized' as const,
  tenant: { id: 'tenant-1', slug: 'acme' },
  session: { id: 'profile-1', role: 'customer' as const, tenantId: 'tenant-1' },
  company: { id: 'company-1', tenantId: 'tenant-1', companyName: 'Acme' },
} as never;

test('Supabase document store binds every query to the authorized tenant and Company', async () => {
  const traces: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  const client = {
    from(table: string) {
      const trace = { table, calls: [] as Array<[string, ...unknown[]]> };
      traces.push(trace);
      const response = { data: [], count: 0, error: null };
      const builder = Object.fromEntries(
        ['select', 'eq', 'not', 'order', 'limit'].map((method) => [
          method,
          (...args: unknown[]) => {
            trace.calls.push([method, ...args]);
            return builder;
          },
        ]),
      ) as Record<string, (...args: unknown[]) => unknown> & {
        then: (resolve: (value: typeof response) => unknown) => Promise<unknown>;
      };
      builder.then = (resolve) => Promise.resolve(response).then(resolve);
      return builder;
    },
  };
  const store = createCustomerDocumentCenterSupabaseStore(client as never);

  await Promise.all([
    store.awaitingCount('tenant-1', 'company-1'),
    store.reviewCount('tenant-1', 'company-1', 'pending'),
    store.reviewCount('tenant-1', 'company-1', 'approved'),
    store.reviewCount('tenant-1', 'company-1', 'rejected'),
    store.requests('tenant-1', 'company-1'),
    store.documents('tenant-1', 'company-1'),
  ]);

  for (const trace of traces) {
    assert.ok(trace.calls.some((call) => call[0] === 'eq' && call[1] === 'tenant_id'));
    assert.ok(
      trace.calls.some(
        (call) => call[0] === 'eq' && call[1] === 'company_id' && call[2] === 'company-1',
      ),
    );
  }
  assert.equal(traces.filter((trace) => trace.table === 'documents').length, 4);
  assert.ok(
    traces
      .filter((trace) => trace.table === 'documents')
      .some((trace) =>
        trace.calls.some(
          (call) => call[0] === 'not' && call[1] === 'current_version_id' && call[2] === 'is',
        ),
      ),
  );
});

test('document sources settle independently and preserve exact zero counts', async () => {
  const ok = { data: [], count: 0, error: null };
  const failed = { data: null, count: null, error: new Error('private provider detail') };
  const store: CustomerDocumentCenterStore = {
    awaitingCount: async () => ok,
    reviewCount: async (_tenant, _company, status) => (status === 'rejected' ? failed : ok),
    requests: async () => failed,
    documents: async () => ok,
  };

  const result = await loadCustomerDocumentCenter(access, { store });

  assert.deepEqual(result.summary.awaiting, { kind: 'ready', value: 0 });
  assert.deepEqual(result.summary.underReview, { kind: 'ready', value: 0 });
  assert.deepEqual(result.summary.approved, { kind: 'ready', value: 0 });
  assert.deepEqual(result.summary.rejected, { kind: 'error' });
  assert.deepEqual(result.requests, { kind: 'error' });
  assert.deepEqual(result.documents, { kind: 'empty', value: [], hasMore: false });
});

test('invalid negative provider counts fail closed', async () => {
  const store: CustomerDocumentCenterStore = {
    awaitingCount: async () => ({ data: null, count: -1, error: null }),
    reviewCount: async () => ({ data: null, count: 0, error: null }),
    requests: async () => ({ data: [], count: null, error: null }),
    documents: async () => ({ data: [], count: null, error: null }),
  };
  const result = await loadCustomerDocumentCenter(access, { store });
  assert.deepEqual(result.summary.awaiting, { kind: 'error' });
});

test('document center bounds deterministic queues and does not fabricate unavailable scan truth', async () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({
    id: `doc-${index}`,
    doc_type: 'passport' as const,
    label: `Passport ${index}`,
    request_id: null,
    updated_at: '2026-09-01T10:00:00Z',
    currentVersion: {
      id: `version-${index}`,
      mime_type: 'application/pdf',
      size_bytes: 50,
      review_status: 'pending' as const,
      review_note: null,
      reviewed_at: null,
      created_at: '2026-09-01T10:00:00Z',
    },
  }));
  const store: CustomerDocumentCenterStore = {
    awaitingCount: async () => ({ data: null, count: 0, error: null }),
    reviewCount: async () => ({ data: null, count: 0, error: null }),
    requests: async () => ({ data: [], count: null, error: null }),
    documents: async () => ({ data: rows, count: null, error: null }),
  };

  const result = await loadCustomerDocumentCenter(access, { store });
  assert.equal(result.documents.kind, 'ready');
  if (result.documents.kind !== 'ready') return;
  assert.equal(result.documents.value.length, 50);
  assert.equal(result.documents.hasMore, true);
  assert.doesNotMatch(JSON.stringify(result), /storage_path|sha256|reviewed_by|uploaded_by/u);
  assert.match(JSON.stringify(result), /"scanStatus":"unavailable"/u);
  assert.doesNotMatch(JSON.stringify(result), /"scanStatus":"passed"/u);
});
