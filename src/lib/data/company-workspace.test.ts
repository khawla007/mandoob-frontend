import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const tenantId = '11111111-1111-4111-8111-111111111111';
const companyId = '33333333-3333-4333-8333-333333333333';
const documentId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';

function loaders(calls: Array<[string, string | undefined]>) {
  return {
    documents: async (_tenant: string, _company: string, focus?: string) => {
      calls.push(['documents', focus]);
      return { rows: [{ id: 'doc' }], focusedId: focus };
    },
    requests: async (_tenant: string, _company: string, focus?: string) => {
      calls.push(['requests', focus]);
      return { rows: [{ id: 'request' }], focusedId: focus };
    },
    renewals: async () => {
      calls.push(['renewals', undefined]);
      return [{ id: 'renewal' }];
    },
    payments: async () => {
      calls.push(['payments', undefined]);
      return [{ id: 'invoice' }];
    },
    activity: async () => {
      calls.push(['activity', undefined]);
      return [{ id: 'audit' }];
    },
  };
}

test('company workspace loads only the active documents datasets with exact focus IDs', async () => {
  const { loadAssignedCompanyWorkspace } = await import('./company-workspace');
  const calls: Array<[string, string | undefined]> = [];
  const result = await loadAssignedCompanyWorkspace(
    tenantId,
    companyId,
    { tab: 'documents', documentId, requestId },
    loaders(calls) as never,
  );

  assert.deepEqual(calls, [
    ['documents', documentId],
    ['requests', requestId],
  ]);
  assert.deepEqual(result.documents, {
    status: 'ready',
    data: [{ id: 'doc' }],
    focusedId: documentId,
  });
  assert.deepEqual(result.requests, {
    status: 'ready',
    data: [{ id: 'request' }],
    focusedId: requestId,
  });
  assert.deepEqual(result.renewals, { status: 'unrequested' });
  assert.deepEqual(result.payments, { status: 'unrequested' });
  assert.deepEqual(result.activity, { status: 'unrequested' });
});

test('each non-document tab calls only its own loader and overview calls none', async () => {
  const { loadAssignedCompanyWorkspace } = await import('./company-workspace');
  for (const tab of ['overview', 'renewals', 'payments', 'activity'] as const) {
    const calls: Array<[string, string | undefined]> = [];
    const result = await loadAssignedCompanyWorkspace(
      tenantId,
      companyId,
      { tab },
      loaders(calls) as never,
    );
    assert.deepEqual(
      calls.map(([name]) => name),
      tab === 'overview' ? [] : [tab],
    );
    assert.equal(result.documents.status, 'unrequested');
    assert.equal(result.requests.status, 'unrequested');
    if (tab !== 'overview') assert.equal(result[tab].status, 'ready');
  }
});

test('one failed documents source does not hide the successful paired source', async () => {
  const { loadAssignedCompanyWorkspace } = await import('./company-workspace');
  const configured = loaders([]);
  configured.requests = async () => {
    throw new Error('private database detail');
  };
  const result = await loadAssignedCompanyWorkspace(
    tenantId,
    companyId,
    { tab: 'documents' },
    configured as never,
  );
  assert.deepEqual(result.requests, { status: 'error' });
  assert.deepEqual(result.documents, { status: 'ready', data: [{ id: 'doc' }] });
});

test('focused item outside the first fifty is pinned once while the result remains bounded', async () => {
  const { mergeFocusedRow } = await import('./company-workspace');
  const rows = Array.from({ length: 50 }, (_, index) => ({ id: `row-${index}` }));
  const focused = { id: documentId };
  const merged = mergeFocusedRow(rows, focused, 50);
  assert.equal(merged.length, 50);
  assert.equal(merged[0].id, documentId);
  assert.equal(merged.filter((row) => row.id === documentId).length, 1);
  const alreadyListed = mergeFocusedRow([focused, ...rows], focused, 50);
  assert.equal(alreadyListed.length, 50);
  assert.equal(alreadyListed[0].id, documentId);
  assert.equal(alreadyListed.filter((row) => row.id === documentId).length, 1);
  assert.deepEqual(mergeFocusedRow(rows, null, 2), rows.slice(0, 2));
});

test('production panel queries scope lists and exact focus lookups without client identifiers', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./company-workspace.ts', import.meta.url), 'utf8'),
  );
  assert.equal(source.match(/\.limit\(PANEL_LIMIT\)/g)?.length, 5);
  assert.match(
    source,
    /focusedDocumentId[\s\S]*?\.eq\('tenant_id', tenantId\)[\s\S]*?\.eq\('company_id', companyId\)[\s\S]*?\.eq\('id', focusedDocumentId\)/,
  );
  assert.match(
    source,
    /focusedRequestId[\s\S]*?\.eq\('tenant_id', tenantId\)[\s\S]*?\.eq\('company_id', companyId\)[\s\S]*?\.eq\('id', focusedRequestId\)/,
  );
  assert.match(source, /\.contains\('details', \{ company_id: companyId \}\)/);
  assert.doesNotMatch(source, /client_id/);
});
