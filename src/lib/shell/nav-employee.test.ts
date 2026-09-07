import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./nav-employee.ts', import.meta.url), 'utf8');

test('Employee navigation exposes only own-person operational destinations', () => {
  const hrefs = [...source.matchAll(/href: `\$\{base\}([^`]+)`/gu)].map(
    (match) => `/t/acme/employee${match[1]}`,
  );
  assert.deepEqual(hrefs, [
    '/t/acme/employee/dashboard',
    '/t/acme/employee/profile',
    '/t/acme/employee/tasks',
    '/t/acme/employee/calendar',
    '/t/acme/employee/identity',
    '/t/acme/employee/documents',
    '/t/acme/employee/renewals',
    '/t/acme/employee/communications',
    '/t/acme/employee/notifications',
    '/t/acme/employee/activity',
    '/t/acme/employee/settings',
  ]);
  assert.equal(
    hrefs.some((href) => /payment|invoice|meeting/iu.test(href)),
    false,
  );
});
