import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const routes = [
  'src/app/admin/tasks/page.tsx',
  'src/app/admin/calendar/page.tsx',
  'src/app/admin/communications/page.tsx',
  'src/app/admin/notifications/page.tsx',
  'src/app/admin/meetings/page.tsx',
  'src/app/(tenant)/t/[tenant]/(pro)/tasks/page.tsx',
  'src/app/(tenant)/t/[tenant]/(pro)/calendar/page.tsx',
  'src/app/(tenant)/t/[tenant]/(pro)/communications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(pro)/notifications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(customer)/portal/tasks/page.tsx',
  'src/app/(tenant)/t/[tenant]/(customer)/portal/calendar/page.tsx',
  'src/app/(tenant)/t/[tenant]/(customer)/portal/communications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(customer)/portal/notifications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(customer)/portal/activity/page.tsx',
  'src/app/(tenant)/t/[tenant]/(employee)/employee/tasks/page.tsx',
  'src/app/(tenant)/t/[tenant]/(employee)/employee/calendar/page.tsx',
  'src/app/(tenant)/t/[tenant]/(employee)/employee/communications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(employee)/employee/notifications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(employee)/employee/activity/page.tsx',
] as const;

test('every useful authorized operational route has truthful unavailable geometry', () => {
  for (const route of routes) {
    assert.equal(existsSync(resolve(route)), true, route);
    const source = readFileSync(resolve(route), 'utf8');
    assert.match(source, /OperationalUnavailableRoute/u, route);
    assert.doesNotMatch(source, /outbox|template|audit-log|completeTask/u, route);
  }
});

test('every route authorizes directly for its role', () => {
  for (const route of routes) {
    const source = readFileSync(resolve(route), 'utf8');
    if (route.includes('/admin/')) assert.match(source, /requirePlatformOperator/u, route);
    if (route.includes('/\(pro\)/')) assert.match(source, /requireProTenantRouteAccess/u, route);
    if (route.includes('/\(customer\)/'))
      assert.match(source, /authorizeCustomerLinkedCompanyRead/u, route);
    if (route.includes('/\(employee\)/'))
      assert.match(source, /authorizeEmployeePortalRead/u, route);
  }
});
