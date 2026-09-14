import assert from 'node:assert/strict';
import test from 'node:test';

import { adminRegistrationHref, parseAdminRegistrationQuery } from './admin-query';

test('registration filters are bounded and preserve recognized values', () => {
  assert.deepEqual(
    parseAdminRegistrationQuery({ stage: 'visa_processing', status: 'blocked', page: '3' }),
    {
      company: null,
      pro: null,
      stage: 'visa_processing',
      status: 'blocked',
      page: 3,
    },
  );
  assert.equal(parseAdminRegistrationQuery({ stage: 'invented', page: '-2' }).stage, 'all');
  assert.equal(parseAdminRegistrationQuery({ page: '999999' }).page, 1);
});

test('registration href emits only active filters', () => {
  assert.equal(
    adminRegistrationHref({ company: 'Acme', pro: null, stage: 'all', status: 'all', page: 2 }),
    '/admin/registrations?company=Acme&page=2',
  );
});
