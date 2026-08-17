import assert from 'node:assert/strict';
import test from 'node:test';
import { runAuthorizedMutation } from './authorized-mutation';

test('authorization denial performs no privileged or compensation calls', async () => {
  const calls: string[] = [];
  await assert.rejects(
    runAuthorizedMutation({
      authorize: async () => {
        calls.push('authorize');
        throw new Error('DENIED');
      },
      run: async () => {
        calls.push('privileged');
        return 'ok';
      },
      compensate: async () => {
        calls.push('compensate');
      },
      recover: () => 'failed',
    }),
    /DENIED/,
  );
  assert.deepEqual(calls, ['authorize']);
});

test('authorized failure compensates with the authorized context only', async () => {
  const calls: string[] = [];
  const result = await runAuthorizedMutation({
    authorize: async () => ({ tenantId: 'tenant-a' }),
    run: async ({ tenantId }) => {
      calls.push(`run:${tenantId}`);
      throw new Error('DB_ERROR');
    },
    compensate: async ({ tenantId }) => {
      calls.push(`compensate:${tenantId}`);
    },
    recover: () => 'failed',
  });
  assert.equal(result, 'failed');
  assert.deepEqual(calls, ['run:tenant-a', 'compensate:tenant-a']);
});
