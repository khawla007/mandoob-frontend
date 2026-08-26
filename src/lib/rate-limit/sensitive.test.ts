import assert from 'node:assert/strict';
import test from 'node:test';

test('sensitive rate limiter distinguishes denied and unavailable while redacting diagnostics', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon-key-at-least-twenty-characters';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-at-least-twenty-characters';
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ||= 'example.test';
  const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('./index');
  assert.equal(
    await consumeSensitiveRateLimit(
      {
        key: 'credential:actor:target',
        routeLabel: 'credential-mutation',
        correlationId: 'corr',
        ...SENSITIVE_RATE_LIMITS.credentialMutation,
      },
      { consume: async () => ({ data: false, error: null }) },
    ),
    'limited',
  );

  const messages: unknown[][] = [];
  assert.equal(
    await consumeSensitiveRateLimit(
      {
        key: 'secret-target',
        routeLabel: 'credential-review',
        correlationId: 'corr',
        ...SENSITIVE_RATE_LIMITS.credentialReview,
      },
      {
        consume: async () => ({ data: null, error: { message: 'database secret' } }),
        log: (...args) => messages.push(args),
      },
    ),
    'unavailable',
  );
  assert.deepEqual(messages, [
    [
      'sensitive-rate-limit unavailable',
      { routeLabel: 'credential-review', correlationId: 'corr' },
    ],
  ]);
});
