import assert from 'node:assert/strict';
import test from 'node:test';

test('company query accepts the first supported tab and exact document UUID', async () => {
  const { parseAssignedCompanySearch } = await import('./page-logic');
  assert.deepEqual(
    parseAssignedCompanySearch({
      tab: ['documents', 'payments'],
      document: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      request: '33333333-3333-4333-8333-333333333333',
    }),
    {
      tab: 'documents',
      documentId: '11111111-1111-4111-8111-111111111111',
      requestId: '33333333-3333-4333-8333-333333333333',
    },
  );
});

test('company query rejects unsupported and unsafe values', async () => {
  const { parseAssignedCompanySearch } = await import('./page-logic');
  assert.deepEqual(parseAssignedCompanySearch({ tab: 'clients', document: '../secret' }), {
    tab: 'overview',
    documentId: undefined,
    requestId: undefined,
  });
});
