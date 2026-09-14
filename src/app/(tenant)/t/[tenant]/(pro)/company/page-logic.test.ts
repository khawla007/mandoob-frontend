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
  assert.deepEqual(parseAssignedCompanySearch({ tab: 'company_profiles', document: '../secret' }), {
    tab: 'overview',
    documentId: undefined,
    requestId: undefined,
  });
});

test('legacy company redirect omits the default overview query but preserves approved focus', async () => {
  const { buildAssignedCompanyHref } = await import('./page-logic');

  assert.equal(
    buildAssignedCompanyHref('acme & co', {
      tab: 'overview',
      documentId: undefined,
      requestId: undefined,
    }),
    '/t/acme%20%26%20co/company',
  );
  assert.equal(
    buildAssignedCompanyHref('acme', {
      tab: 'documents',
      documentId: '11111111-1111-4111-8111-111111111111',
      requestId: undefined,
    }),
    '/t/acme/company?tab=documents&document=11111111-1111-4111-8111-111111111111',
  );
  assert.equal(
    buildAssignedCompanyHref('acme', {
      tab: 'documents',
      documentId: undefined,
      requestId: '22222222-2222-4222-8222-222222222222',
    }),
    '/t/acme/company?tab=documents&request=22222222-2222-4222-8222-222222222222',
  );
  assert.equal(
    buildAssignedCompanyHref('acme', {
      tab: 'payments',
      documentId: undefined,
      requestId: undefined,
    }),
    '/t/acme/company?tab=payments',
  );
});
