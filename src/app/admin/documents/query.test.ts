import assert from 'node:assert/strict';
import test from 'node:test';

import { adminDocumentCenterHref, parseAdminDocumentCenterQuery } from './query';

test('parses strict bounded document oversight filters', () => {
  assert.deepEqual(
    parseAdminDocumentCenterQuery({
      q: '  Acme Trading  ',
      state: 'under_review',
      docType: 'trade_license',
      page: '4',
    }),
    {
      q: 'Acme Trading',
      state: 'under_review',
      docType: 'trade_license',
      page: 4,
      pageSize: 25,
    },
  );
});

test('rejects repeated, unsupported, overlong, and unbounded query values', () => {
  assert.deepEqual(
    parseAdminDocumentCenterQuery({
      q: ['Acme', 'Other'],
      state: 'unknown',
      docType: ['passport', 'visa'],
      page: '10001',
    }),
    { q: null, state: 'all', docType: 'all', page: 1, pageSize: 25 },
  );
  assert.equal(parseAdminDocumentCenterQuery({ q: 'x'.repeat(101) }).q, null);
  assert.equal(parseAdminDocumentCenterQuery({ page: '-1' }).page, 1);
});

test('builds stable URL-driven pagination while preserving validated filters', () => {
  assert.equal(
    adminDocumentCenterHref(
      {
        q: 'Acme Trading',
        state: 'rejected',
        docType: 'passport',
        page: 2,
        pageSize: 25,
      },
      3,
    ),
    '/admin/documents?q=Acme+Trading&state=rejected&docType=passport&page=3',
  );
});
