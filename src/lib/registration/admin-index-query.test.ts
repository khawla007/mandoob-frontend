import assert from 'node:assert/strict';
import test from 'node:test';

import { adminRegistrationPagination, buildAdminRegistrationIndexQuery } from './admin-index-query';

const UUID = '12121212-1212-4212-8212-121212121212';

test('maps a uuid company/pro filter through and drops non-uuid free text', () => {
  assert.deepEqual(
    buildAdminRegistrationIndexQuery({
      company: UUID,
      pro: 'Acme PRO',
      stage: 'name_reservation',
      status: 'blocked',
      page: 3,
    }),
    { company: UUID, pro: null, stage: 'name_reservation', status: 'blocked', page: 3 },
  );
});

test("maps the 'all' sentinel to a null enum filter", () => {
  assert.deepEqual(
    buildAdminRegistrationIndexQuery({
      company: null,
      pro: null,
      stage: 'all',
      status: 'all',
      page: 1,
    }),
    { company: null, pro: null, stage: null, status: null, page: 1 },
  );
});

test('a non-uuid company filter never reaches the RPC as a scan (dropped to null)', () => {
  const result = buildAdminRegistrationIndexQuery({
    company: 'not-a-uuid',
    pro: null,
    stage: 'all',
    status: 'all',
    page: 1,
  });
  assert.equal(result.company, null);
});

const baseQuery = {
  company: null,
  pro: null,
  stage: 'all' as const,
  status: 'all' as const,
  page: 2,
};

test('pagination: previous exists past page 1; next only when more rows remain', () => {
  assert.deepEqual(adminRegistrationPagination(baseQuery, { total: 100, page: 2, pageSize: 20 }), {
    // page 1 is the default, so the href omits the page param.
    previous: '/admin/registrations',
    next: '/admin/registrations?page=3',
  });
});

test('pagination: no next on the last page window', () => {
  assert.deepEqual(
    adminRegistrationPagination({ ...baseQuery, page: 5 }, { total: 100, page: 5, pageSize: 20 }),
    {
      previous: '/admin/registrations?page=4',
      next: null,
    },
  );
});

test('pagination: no previous on page 1, no next when state is unavailable', () => {
  assert.deepEqual(adminRegistrationPagination({ ...baseQuery, page: 1 }, null), {
    previous: null,
    next: null,
  });
});
