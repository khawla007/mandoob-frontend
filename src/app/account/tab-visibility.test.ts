import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleTabs } from '@/components/account/tab-defs';

const expected: Record<string, string[]> = {
  super_admin: ['/account', '/account/security', '/account/sessions'],
  admin: ['/account', '/account/security', '/account/sessions'],
  pro: ['/account', '/account/security', '/account/role', '/account/sessions'],
  customer: ['/account', '/account/security', '/account/role'],
  employee: ['/account', '/account/security', '/account/role'],
};

for (const [role, hrefs] of Object.entries(expected)) {
  test(`visibleTabs(${role}) matches matrix`, () => {
    const got = visibleTabs(role as 'super_admin' | 'admin' | 'pro' | 'customer' | 'employee').map(
      (t) => t.href,
    );
    assert.deepEqual(got, hrefs);
  });
}
