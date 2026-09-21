import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const subject = import('./admin-document-center');

const query = {
  q: 'Acme',
  state: 'under_review' as const,
  docType: 'passport' as const,
  page: 2,
  pageSize: 25 as const,
};

test('authorizes the active AAL2 platform operator before starting the service read', async () => {
  const { listAdminDocumentCenter } = await subject;
  let rpcStarted = false;
  await assert.rejects(
    () =>
      listAdminDocumentCenter(query, {
        requireOperator: async () => {
          assert.equal(rpcStarted, false);
          throw new Error('DENIED');
        },
        rpc: async () => {
          rpcStarted = true;
          return { data: null, error: null };
        },
      }),
    /DENIED/u,
  );
  assert.equal(rpcStarted, false);
});

test('uses one bounded database projection and returns only safe display metadata', async () => {
  const { listAdminDocumentCenter } = await subject;
  const calls: unknown[] = [];
  const result = await listAdminDocumentCenter(query, {
    requireOperator: async () => ({ role: 'admin', aal: 'aal2', status: 'active' }),
    rpc: async (args) => {
      calls.push(args);
      return {
        error: null,
        data: {
          total: 31,
          page: 2,
          rows: [
            {
              kind: 'document',
              workspaceName: 'Acme Workspace',
              companyName: 'Acme Trading LLC',
              docType: 'passport',
              label: 'Director passport',
              requestStatus: 'fulfilled',
              dueAt: '2026-09-20T12:00:00.000Z',
              uploadedAt: '2026-09-19T12:00:00.000Z',
              reviewStatus: 'pending',
              expiresOn: null,
              createdAt: '2026-09-18T12:00:00.000Z',
            },
          ],
        },
      };
    },
  });
  assert.deepEqual(calls, [
    {
      p_search: 'Acme',
      p_state: 'under_review',
      p_doc_type: 'passport',
      p_page: 2,
      p_page_size: 25,
    },
  ]);
  assert.equal(result.kind, 'ready');
  assert.equal(result.total, 31);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
  assert.doesNotMatch(
    JSON.stringify(result),
    /storage|sha|signed|tenantId|companyId|documentId|versionId/iu,
  );
});

test('preserves an authoritative empty result with exact pagination metadata', async () => {
  const { listAdminDocumentCenter } = await subject;
  const result = await listAdminDocumentCenter(
    { q: null, state: 'all', docType: 'all', page: 9, pageSize: 25 },
    {
      requireOperator: async () => undefined,
      rpc: async () => ({ data: { total: 0, page: 1, rows: [] }, error: null }),
    },
  );
  assert.deepEqual(result, {
    kind: 'empty',
    rows: [],
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  });
});

test('rejects an invalid direct read contract without starting the service read', async () => {
  const { listAdminDocumentCenter } = await subject;
  let rpcStarted = false;
  const result = await listAdminDocumentCenter({ ...query, pageSize: 50 } as never, {
    requireOperator: async () => undefined,
    rpc: async () => {
      rpcStarted = true;
      return { data: null, error: null };
    },
    logFailure: () => undefined,
  });
  assert.deepEqual(result, { kind: 'error' });
  assert.equal(rpcStarted, false);
});

test('fails closed with a sanitized source state for database and projection errors', async () => {
  const { listAdminDocumentCenter } = await subject;
  const logged: string[] = [];
  const failed = await listAdminDocumentCenter(query, {
    requireOperator: async () => undefined,
    rpc: async () => ({ data: null, error: { message: 'private database detail' } }),
    logFailure: (source) => logged.push(source),
  });
  const malformed = await listAdminDocumentCenter(query, {
    requireOperator: async () => undefined,
    rpc: async () => ({
      data: { total: 1, page: 1, rows: [{ storage_path: 'secret' }] },
      error: null,
    }),
    logFailure: (source) => logged.push(source),
  });
  assert.deepEqual(failed, { kind: 'error' });
  assert.deepEqual(malformed, { kind: 'error' });
  assert.deepEqual(logged, ['adminDocumentCenter', 'adminDocumentCenter']);
  assert.doesNotMatch(
    JSON.stringify([failed, malformed, logged]),
    /private database detail|secret/u,
  );
});
