import assert from 'node:assert/strict';
import test from 'node:test';
import { revalidateLifecyclePaths } from './pro-lifecycle-routes';

test('assigned PRO shell revalidates the tenant root as a layout', async () => {
  const calls: unknown[][] = [];
  await revalidateLifecyclePaths(
    { proProfileId: '10000000-0000-4000-8000-000000000001', credentialIds: [], tenantSlug: 'acme' },
    '10000000-0000-4000-8000-000000000001',
    ((...args: unknown[]) => calls.push(args)) as never,
  );
  assert.ok(calls.some((call) => call[0] === '/t/acme' && call[1] === 'layout'));
});
