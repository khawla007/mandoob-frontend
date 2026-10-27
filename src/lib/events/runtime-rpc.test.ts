import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeRpcError, createRuntimeRpc } from './runtime-rpc';

const cancellation = {
  jobId: '11111111-1111-4111-8111-111111111111',
  workerId: '22222222-2222-4222-8222-222222222222',
  leaseToken: '33333333-3333-4333-8333-333333333333',
  safeCode: 'CONSENT_REQUIRED',
} as const;

test('runtime RPC boundary sends typed projection args and validates its result', async () => {
  const calls: unknown[] = [];
  const runtime = createRuntimeRpc({
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: {
          state: 'applied',
          projectionType: 'activity',
          projectionId: '11111111-1111-4111-8111-111111111111',
        },
        error: null,
      };
    },
  });
  const result = await runtime.writeProjection({
    operationId: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    companyId: '33333333-3333-4333-8333-333333333333',
    eventId: '44444444-4444-4444-8444-444444444444',
    jobId: '55555555-5555-4555-8555-555555555555',
    workerId: '66666666-6666-4666-8666-666666666666',
    leaseToken: '77777777-7777-4777-8777-777777777777',
    projectionType: 'activity',
    projectionKey: 'internal.test.changed',
    code: 'TEST_CHANGED',
    profileId: null,
    state: null,
    priority: null,
    dueAt: null,
    safeMetadata: {},
  });
  assert.equal(result.projectionId, '11111111-1111-4111-8111-111111111111');
  assert.equal((calls[0] as { name: string }).name, 'write_operational_projection');
});

test('runtime RPC boundary requires an exact true leased cancellation result', async () => {
  const runtime = createRuntimeRpc({
    async rpc() {
      return { data: false, error: null };
    },
  });
  assert.equal(await runtime.cancelLeasedJob(cancellation), false);
});

test('runtime RPC boundary rejects malformed responses without exposing raw errors', async () => {
  const runtime = createRuntimeRpc({
    async rpc() {
      return { data: { token: 'secret' }, error: null };
    },
  });
  await assert.rejects(runtime.cancelLeasedJob(cancellation), /RUNTIME_RPC_FAILED/);
});

test('runtime RPC boundary classifies deterministic SQL failures without raw details', async () => {
  const runtime = createRuntimeRpc({
    async rpc() {
      return { data: null, error: { code: 'P3102', message: 'private row detail' } };
    },
  });
  await assert.rejects(runtime.cancelLeasedJob(cancellation), (error) => {
    assert.ok(error instanceof RuntimeRpcError);
    assert.deepEqual(error.failure, {
      category: 'configuration',
      code: 'PROVIDER_CONFIGURATION_INVALID',
      retryable: false,
    });
    assert.equal(JSON.stringify(error).includes('private row detail'), false);
    return true;
  });
});

test('runtime RPC boundary classifies serialization and deadlock failures as retryable', async () => {
  for (const code of ['40001', '40P01']) {
    const runtime = createRuntimeRpc({
      async rpc() {
        return { data: null, error: { code, message: 'private row detail' } };
      },
    });
    await assert.rejects(runtime.cancelLeasedJob(cancellation), (error) => {
      assert.ok(error instanceof RuntimeRpcError);
      assert.deepEqual(error.failure, {
        category: 'provider_unavailable',
        code: 'PROVIDER_UNAVAILABLE',
        retryable: true,
      });
      return true;
    });
  }
});

test('runtime RPC boundary classifies cancellation SQLSTATE as a retryable timeout', async () => {
  const runtime = createRuntimeRpc({
    async rpc() {
      return { data: null, error: { code: '57014', message: 'statement detail' } };
    },
  });
  await assert.rejects(runtime.cancelLeasedJob(cancellation), (error) => {
    assert.ok(error instanceof RuntimeRpcError);
    assert.deepEqual(error.failure, {
      category: 'timeout',
      code: 'PROVIDER_TIMEOUT',
      retryable: true,
    });
    return true;
  });
});

test('runtime RPC boundary classifies no-code network failures as retryable and sanitized', async () => {
  for (const transportFailure of [
    new Error('connect ECONNRESET private-host'),
    { code: '', message: 'fetch failed private-host' },
  ]) {
    const runtime = createRuntimeRpc({
      async rpc() {
        if (transportFailure instanceof Error) throw transportFailure;
        return { data: null, error: transportFailure };
      },
    });
    await assert.rejects(runtime.cancelLeasedJob(cancellation), (error) => {
      assert.ok(error instanceof RuntimeRpcError);
      assert.deepEqual(error.failure, {
        category: 'provider_unavailable',
        code: 'PROVIDER_UNAVAILABLE',
        retryable: true,
      });
      assert.equal(error.message, 'RUNTIME_RPC_FAILED');
      return true;
    });
  }
});
