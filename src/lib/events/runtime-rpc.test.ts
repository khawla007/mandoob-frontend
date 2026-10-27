import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeRpc } from './runtime-rpc';

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
  assert.equal(
    await runtime.cancelLeasedJob({
      jobId: '11111111-1111-4111-8111-111111111111',
      workerId: '22222222-2222-4222-8222-222222222222',
      leaseToken: '33333333-3333-4333-8333-333333333333',
      safeCode: 'CONSENT_REQUIRED',
    }),
    false,
  );
});

test('runtime RPC boundary rejects malformed responses without exposing raw errors', async () => {
  const runtime = createRuntimeRpc({
    async rpc() {
      return { data: { token: 'secret' }, error: null };
    },
  });
  await assert.rejects(
    runtime.cancelLeasedJob({
      jobId: '11111111-1111-4111-8111-111111111111',
      workerId: '22222222-2222-4222-8222-222222222222',
      leaseToken: '33333333-3333-4333-8333-333333333333',
      safeCode: 'CONSENT_REQUIRED',
    }),
    /RUNTIME_RPC_FAILED/,
  );
});
