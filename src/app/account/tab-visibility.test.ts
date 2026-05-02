import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleTabs } from '@/components/account/tab-defs';

// Sessions tab temporarily removed pending rebuild — see docs/issues/account-sessions-tab-rebuild.md
const expected: Record<string, string[]> = {
  super_admin: ['/account', '/account/security'],
  admin: ['/account', '/account/security'],
  pro: ['/account', '/account/security', '/account/role'],
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
