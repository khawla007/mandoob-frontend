import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon-key-at-least-twenty-characters';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-at-least-twenty-characters';
process.env.NEXT_PUBLIC_ROOT_DOMAIN ||= 'example.test';

const limiter = import('./index');

const config = {
  key: 'login:private-ip',
  capacity: 1,
  refillPerSec: 1,
  routeLabel: 'login',
  correlationId: 'cid',
};

test('typed rate limiter allows an accepted consumption', async () => {
  const { consumeRateLimitDecision } = await limiter;

  assert.equal(
    await consumeRateLimitDecision(config, {
      consume: async () => ({ data: true, error: null }),
    }),
    'allowed',
  );
});

test('typed rate limiter reports a denied consumption as limited', async () => {
  const { consumeRateLimitDecision } = await limiter;

  assert.equal(
    await consumeRateLimitDecision(config, {
      consume: async () => ({ data: false, error: null }),
    }),
    'limited',
  );
});

test('typed rate limiter treats an RPC error as unavailable with redacted diagnostics', async () => {
  const { consumeRateLimitDecision } = await limiter;
  const logs: unknown[][] = [];

  assert.equal(
    await consumeRateLimitDecision(config, {
      consume: async () => ({ data: null, error: new Error('database-secret') }),
      log: (...args) => logs.push(args),
    }),
    'unavailable',
  );
  assert.deepEqual(logs, [
    ['rate-limit unavailable', { routeLabel: 'login', correlationId: 'cid' }],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /private-ip|database-secret/u);
});

test('typed rate limiter treats a thrown exception as unavailable with redacted diagnostics', async () => {
  const { consumeRateLimitDecision } = await limiter;
  const logs: unknown[][] = [];

  assert.equal(
    await consumeRateLimitDecision(config, {
      consume: async () => {
        throw new Error('thrown-secret');
      },
      log: (...args) => logs.push(args),
    }),
    'unavailable',
  );
  assert.deepEqual(logs, [
    ['rate-limit unavailable', { routeLabel: 'login', correlationId: 'cid' }],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /private-ip|thrown-secret/u);
});

test('typed rate limiter treats null data as unavailable', async () => {
  const { consumeRateLimitDecision } = await limiter;

  assert.equal(
    await consumeRateLimitDecision(config, {
      consume: async () => ({ data: null, error: null }),
      log: () => undefined,
    }),
    'unavailable',
  );
});

test('typed rate limiter treats non-boolean string data as unavailable', async () => {
  const { consumeRateLimitDecision } = await limiter;

  assert.equal(
    await consumeRateLimitDecision(config, {
      consume: async () => ({ data: 'true', error: null }),
      log: () => undefined,
    }),
    'unavailable',
  );
});

test('sensitive rate limiter preserves typed decision behavior', async () => {
  const { consumeSensitiveRateLimit } = await limiter;

  assert.equal(
    await consumeSensitiveRateLimit(config, {
      consume: async () => ({ data: false, error: null }),
    }),
    'limited',
  );
  assert.equal(
    await consumeSensitiveRateLimit(config, {
      consume: async () => ({ data: true, error: null }),
    }),
    'allowed',
  );
});
