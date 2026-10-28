import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = new URL('./admin-navigation.ts', import.meta.url);

test('admin Company operational links preserve one validated Company scope', async () => {
  assert.equal(existsSync(modulePath), true);
  const { adminCompanyOperationalHref } = await import('./admin-navigation');
  const companyId = '00000000-0000-4000-8000-000000000003';
  assert.deepEqual(
    ['tasks', 'notifications', 'communications'].map((module) =>
      adminCompanyOperationalHref(companyId, module),
    ),
    [
      `/admin/tasks?companyId=${companyId}`,
      `/admin/notifications?companyId=${companyId}`,
      `/admin/communications?companyId=${companyId}`,
    ],
  );
  assert.throws(() => adminCompanyOperationalHref('not-a-uuid', 'tasks'));
});

test('admin Company list and detail consume the scoped operational link builder', () => {
  const list = readFileSync('src/app/admin/companies/page.tsx', 'utf8');
  const detail = readFileSync('src/app/admin/companies/[id]/page.tsx', 'utf8');
  assert.match(list, /adminCompanyOperationalHref\(company\.id/u);
  assert.match(detail, /adminCompanyOperationalHref\(company\.id/u);
});
