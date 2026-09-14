import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

test('credential upload cleanup cron requires the configured secret before work', async () => {
  const { createCleanupRouteHandler } = await import('./route-handler');
  let runs = 0;
  const handler = createCleanupRouteHandler({
    secret: () => 'cron-secret',
    run: async () => {
      runs += 1;
      return { claimed: 0, quiescing: 0, cleaned: 0, referenced: 0, retryable: 0 };
    },
  });
  for (const headers of [new Headers(), new Headers({ 'x-cron-secret': 'wrong' })]) {
    const response = await handler(
      new Request('http://localhost/cron', { method: 'POST', headers }),
    );
    assert.equal(response.status, 401);
  }
  assert.equal(runs, 0);
});

test('credential upload cleanup cron returns only bounded aggregate counts', async () => {
  const { createCleanupRouteHandler } = await import('./route-handler');
  const handler = createCleanupRouteHandler({
    secret: () => 'cron-secret',
    run: async () => ({ claimed: 4, quiescing: 1, cleaned: 1, referenced: 1, retryable: 1 }),
  });
  const response = await handler(
    new Request('http://localhost/cron', {
      method: 'POST',
      headers: { 'x-cron-secret': 'cron-secret' },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    claimed: 4,
    quiescing: 1,
    cleaned: 1,
    referenced: 1,
    retryable: 1,
  });
});

test('credential upload cleanup cron sanitizes worker failures', async () => {
  const { createCleanupRouteHandler } = await import('./route-handler');
  const handler = createCleanupRouteHandler({
    secret: () => 'cron-secret',
    run: async () => {
      throw new Error('private storage path and provider output');
    },
  });
  const response = await handler(
    new Request('http://localhost/cron', {
      method: 'POST',
      headers: { 'x-cron-secret': 'cron-secret' },
    }),
  );
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /private|storage path|provider/u);
});
