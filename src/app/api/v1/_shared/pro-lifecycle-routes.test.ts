import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/lib/errors';
import { lifecycleErrorResponse, revalidateLifecyclePaths } from './pro-lifecycle-routes';

test('evidence upload reservation conflicts remain sanitized 409 responses', async () => {
  for (const code of ['EVIDENCE_UPLOAD_IN_PROGRESS', 'EVIDENCE_UPLOAD_RESERVATION_LOST']) {
    const response = lifecycleErrorResponse(
      new ApiError(code, 'private path/hash detail', 409),
      'x',
    );
    assert.equal(response.status, 409);
    const body = await response.text();
    assert.match(body, new RegExp(code, 'u'));
    assert.doesNotMatch(body, /private path|hash detail/u);
  }
});

test('assigned PRO shell revalidates the tenant root as a layout', async () => {
  const calls: unknown[][] = [];
  await revalidateLifecyclePaths(
    { proProfileId: '10000000-0000-4000-8000-000000000001', credentialIds: [], tenantSlug: 'acme' },
    '10000000-0000-4000-8000-000000000001',
    ((...args: unknown[]) => calls.push(args)) as never,
  );
  assert.ok(calls.some((call) => call[0] === '/t/acme' && call[1] === 'layout'));
});
