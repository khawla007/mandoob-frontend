import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalCompanyListHref,
  companyListHref,
  parseCompanyListQuery,
} from './company-list-query';

const tenantId = '11111111-1111-4111-8111-111111111111';

test('parses a single validated company-list query', () => {
  assert.deepEqual(
    parseCompanyListQuery({ status: 'active', q: '  Acme  ', tenant: tenantId, page: '3' }),
    { status: 'active', q: 'Acme', tenantId, page: 3, pageSize: 25 },
  );
});

test('repeated and malformed values fall back deterministically', () => {
  assert.deepEqual(
    parseCompanyListQuery({
      status: ['active', 'suspended'],
      q: ['Acme', 'Other'],
      tenant: 'not-a-uuid',
      page: '-2',
    }),
    { status: 'all', q: null, tenantId: null, page: 1, pageSize: 25 },
  );
  assert.equal(parseCompanyListQuery({ q: 'x'.repeat(101) }).q, null);
  assert.equal(parseCompanyListQuery({ page: ['2', '3'] }).page, 1);
});

test('builds stable pagination URLs while preserving validated filters', () => {
  assert.equal(
    companyListHref({ status: 'active', q: 'Acme LLC', tenantId, page: 2, pageSize: 25 }, 4),
    `/admin/companies?status=active&q=Acme+LLC&tenant=${tenantId}&page=4`,
  );
});

test('canonicalizes an out-of-range empty page to page one while preserving filters', () => {
  const query = parseCompanyListQuery({ status: 'active', q: 'Acme', tenant: tenantId, page: '2' });
  assert.equal(
    canonicalCompanyListHref(query, 0),
    `/admin/companies?status=active&q=Acme&tenant=${tenantId}`,
  );
  assert.equal(canonicalCompanyListHref({ ...query, page: 1 }, 0), null);
});
