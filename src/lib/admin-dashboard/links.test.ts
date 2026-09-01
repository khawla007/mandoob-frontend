import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_DASHBOARD_LINKS } from './links';

test('dashboard links include only existing destinations and consumed filters', () => {
  assert.deepEqual(ADMIN_DASHBOARD_LINKS, {
    leads: '/admin/leads',
    companies: '/admin/companies',
    proRegistry: '/admin/users?role=pro',
    unassignedPros: '/admin/users?role=pro&assignment=unassigned',
    finance: '/admin/finance',
    audit: '/admin/audit-logs',
  });
  for (const href of Object.values(ADMIN_DASHBOARD_LINKS)) {
    assert.match(href, /^\/admin(?:\/|$)/u);
    assert.doesNotMatch(href, /javascript:|registration|renewal|document/u);
  }
});
