import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  documentCenterSearchSchema,
  documentCenterSorts,
  documentCenterViews,
  documentCenterWindows,
  documentExpirySchema,
} from './pro-document-center';
import {
  documentCenterHref,
  parseDocumentCenterSearch,
} from '../../app/(tenant)/t/[tenant]/(pro)/documents/page-logic';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

test('document center exposes only the locked view, sort, and window values', () => {
  assert.deepEqual(documentCenterViews, [
    'all',
    'requested',
    'submitted',
    'approved',
    'rejected',
    'expiring',
    'overdue',
  ]);
  assert.deepEqual(documentCenterSorts, ['urgency', 'newest', 'oldest', 'due_date', 'expiry_date']);
  assert.deepEqual(documentCenterWindows, ['all', 'overdue', '7', '30', '90']);
});

test('document center parser consumes only the first repeated scalar value', () => {
  assert.deepEqual(
    parseDocumentCenterSearch({ view: ['rejected', 'approved'], page: ['2', '9'] }),
    { view: 'rejected', sort: 'urgency', window: 'all', page: 2 },
  );
  assert.deepEqual(
    parseDocumentCenterSearch({
      client: [CLIENT_ID, 'not-a-uuid'],
      type: ['visa', 'birth_certificate'],
      q: ['  renewal  ', 'ignored'],
      search: 'ignored alias',
    }),
    {
      view: 'all',
      sort: 'urgency',
      window: 'all',
      page: 1,
      clientId: CLIENT_ID,
      docType: 'visa',
      search: 'renewal',
    },
  );
  assert.equal(
    parseDocumentCenterSearch({ q: ' ', search: '  office lease  ' }).search,
    'office lease',
  );
});

test('document center parser falls back per invalid field without trusting later repeated values', () => {
  assert.deepEqual(
    parseDocumentCenterSearch({
      view: ['nope', 'approved'],
      sort: ['bad', 'newest'],
      window: ['999', '30'],
      client: ['not-a-uuid', CLIENT_ID],
      type: ['unknown', 'visa'],
      from: ['2026-02-30', '2026-08-01'],
      to: ['2026-08-32', '2026-08-31'],
      page: ['0', '3'],
    }),
    { view: 'all', sort: 'urgency', window: 'all', page: 1 },
  );
});

test('document center parser validates every view, sort, and window independently', () => {
  for (const view of documentCenterViews) {
    assert.equal(parseDocumentCenterSearch({ view }).view, view);
  }
  for (const sort of documentCenterSorts) {
    assert.equal(parseDocumentCenterSearch({ sort }).sort, sort);
  }
  for (const window of documentCenterWindows) {
    assert.equal(parseDocumentCenterSearch({ window }).window, window);
  }
});

test('document center parser bounds normalized search, ISO date filters, and page numbers', () => {
  assert.deepEqual(
    parseDocumentCenterSearch({
      q: '  office lease  ',
      from: '2026-08-01',
      to: '2026-08-31',
      page: '10000',
    }),
    {
      view: 'all',
      sort: 'urgency',
      window: 'all',
      page: 10000,
      search: 'office lease',
      from: '2026-08-01',
      to: '2026-08-31',
    },
  );
  for (const page of ['0', '-1', '1.5', '1e2', '10001', '9007199254740992']) {
    assert.equal(parseDocumentCenterSearch({ page }).page, 1, page);
  }
  assert.equal(parseDocumentCenterSearch({ q: ' '.repeat(201) }).search, undefined);
  assert.equal(parseDocumentCenterSearch({ from: '08/01/2026' }).from, undefined);
  assert.equal(parseDocumentCenterSearch({ to: '2026-02-30' }).to, undefined);
});

test('document center parser drops inverted valid date bounds without discarding other filters', () => {
  assert.deepEqual(
    parseDocumentCenterSearch({
      view: 'submitted',
      client: CLIENT_ID,
      from: '2026-08-31',
      to: '2026-08-01',
    }),
    {
      view: 'submitted',
      sort: 'urgency',
      window: 'all',
      page: 1,
      clientId: CLIENT_ID,
    },
  );
});

test('document center parser makes preset windows canonical by dropping custom dates', () => {
  const parsed = parseDocumentCenterSearch({
    window: '30',
    from: '2026-08-01',
    to: '2026-08-31',
  });
  assert.deepEqual(parsed, { view: 'all', sort: 'urgency', window: '30', page: 1 });
  assert.equal(documentCenterHref('acme', parsed), '/t/acme/documents?window=30');
});

test('document center focus validates UUIDs, prefers exact document focus, and resets page one', () => {
  assert.deepEqual(parseDocumentCenterSearch({ request: REQUEST_ID, page: '8' }).focus, {
    kind: 'request',
    id: REQUEST_ID,
  });
  assert.equal(parseDocumentCenterSearch({ request: REQUEST_ID, page: '8' }).page, 1);
  assert.deepEqual(
    parseDocumentCenterSearch({ request: REQUEST_ID, document: DOCUMENT_ID, page: '8' }).focus,
    { kind: 'document', id: DOCUMENT_ID },
    'document focus has deterministic precedence when both targets are present',
  );
  assert.equal(parseDocumentCenterSearch({ document: 'not-a-uuid', page: '8' }).page, 8);
});

test('document center href emits only validated non-default filters and preserves focus state', () => {
  const filters = parseDocumentCenterSearch({
    view: 'rejected',
    sort: 'due_date',
    window: '30',
    client: CLIENT_ID,
    type: 'insurance_policy',
    q: '  annual renewal  ',
    from: '2026-08-01',
    to: '2026-08-31',
    document: DOCUMENT_ID,
  });
  assert.equal(
    documentCenterHref('north star/uae', filters, 3),
    `/t/north%20star%2Fuae/documents?view=rejected&sort=due_date&window=30&client=${CLIENT_ID}&type=insurance_policy&q=annual+renewal&document=${DOCUMENT_ID}`,
  );
  assert.equal(documentCenterHref('acme', parseDocumentCenterSearch({})), '/t/acme/documents');
  const pagedFilters = parseDocumentCenterSearch({
    view: 'submitted',
    client: CLIENT_ID,
    page: '2',
  });
  for (const invalidPage of [0, Number.NaN, 10_001]) {
    assert.equal(
      documentCenterHref('acme', pagedFilters, invalidPage),
      `/t/acme/documents?view=submitted&client=${CLIENT_ID}&page=2`,
      String(invalidPage),
    );
  }
  assert.equal(
    documentCenterHref('acme', { view: 'unsupported', sort: 'bad', page: Number.NaN } as never, 0),
    '/t/acme/documents',
  );
});

test('document center schema accepts only validated normalized query primitives', () => {
  assert.equal(
    documentCenterSearchSchema.safeParse({
      view: 'requested',
      sort: 'newest',
      window: '7',
      clientId: CLIENT_ID,
      docType: 'aoa',
      search: 'trade license',
      from: '2026-08-01',
      to: '2026-08-31',
      page: 3,
    }).success,
    true,
  );
  assert.equal(
    documentCenterSearchSchema.safeParse({ docType: 'birth_certificate' }).success,
    false,
  );
});

test('document expiry input accepts UUID plus calendar ISO date or an empty null value', () => {
  const dated = documentExpirySchema.safeParse({
    document_id: DOCUMENT_ID,
    expires_on: '2026-08-31',
  });
  assert.equal(dated.success, true);
  if (dated.success) assert.equal(dated.data.expires_on, '2026-08-31');

  const cleared = documentExpirySchema.safeParse({ document_id: DOCUMENT_ID, expires_on: '' });
  assert.equal(cleared.success, true);
  if (cleared.success) assert.equal(cleared.data.expires_on, null);

  assert.equal(
    documentExpirySchema.safeParse({ document_id: 'not-a-uuid', expires_on: '' }).success,
    false,
  );
  assert.equal(
    documentExpirySchema.safeParse({ document_id: DOCUMENT_ID, expires_on: '2026-02-30' }).success,
    false,
  );
  assert.equal(
    documentExpirySchema.safeParse({ document_id: DOCUMENT_ID, expires_on: '31/08/2026' }).success,
    false,
  );
});
