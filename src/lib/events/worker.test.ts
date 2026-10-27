import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ClaimedEventJob, ClaimedEventJobResult } from './repository';
import {
  EventHandlerFailure,
  handlerKey,
  runEventWorkerOnce,
  type EventWorkerRepository,
} from './worker';

const ids = {
  job: '11111111-1111-4111-8111-111111111111',
  event: '22222222-2222-4222-8222-222222222222',
  tenant: '33333333-3333-4333-8333-333333333333',
  company: '44444444-4444-4444-8444-444444444444',
  correlation: '55555555-5555-4555-8555-555555555555',
  worker: '66666666-6666-4666-8666-666666666666',
  lease: '77777777-7777-4777-8777-777777777777',
} as const;

function job(overrides: Partial<ClaimedEventJob> = {}): ClaimedEventJob {
  return {
    jobId: ids.job,
    eventId: ids.event,
    workerId: ids.worker,
    consumerName: 'internal.test.projection',
    attemptNumber: 1,
    maxAttempts: 5,
    leaseToken: ids.lease,
    leaseExpiresAt: '2026-10-27T10:02:00.000Z',
    effectKey: `mandoob:event-job:${ids.job}`,
    eventType: 'test.changed',
    eventVersion: 1,
    occurredAt: '2026-10-27T10:00:00.000Z',
    tenantId: ids.tenant,
    companyId: ids.company,
    actorId: null,
    correlationId: ids.correlation,
    causationId: null,
    privacyClass: 'internal',
    payload: { resource_id: ids.event },
    ...overrides,
  };
}

function harness(claimed: ClaimedEventJobResult[]) {
  const calls: Array<[string, ...unknown[]]> = [];
  const repository: EventWorkerRepository = {
    heartbeat: async (input) => (calls.push(['heartbeat', input]), true),
    claim: async (input) => (calls.push(['claim', input]), claimed),
    extendLease: async (...args) => (calls.push(['extend', ...args]), '2026-10-27T10:04:00.000Z'),
    succeed: async (...args) => (calls.push(['succeed', ...args]), true),
    fail: async (...args) => (calls.push(['fail', ...args]), 'dead'),
  };
  return { calls, repository };
}

describe('bounded event worker', () => {
  test('heartbeats before an exact bounded consumer claim and dispatches exact version', async () => {
    const state = harness([{ ok: true, job: job() }]);
    const handled: string[] = [];
    const result = await runEventWorkerOnce({
      repository: state.repository,
      handlers: new Map([
        [
          handlerKey('internal.test.projection', 'test.changed', 1),
          async (claimed) => (
            handled.push(claimed.effectKey),
            { effectReferenceHash: 'a'.repeat(64) }
          ),
        ],
      ]),
      clock: () => new Date('2026-10-27T10:00:00.000Z'),
      workerId: ids.worker,
      workerName: 'p3-10-worker',
      consumerName: 'internal.test.projection',
      schedulerOwner: 'netlify.event-runtime',
      releaseVersion: 'p3.10-test',
      batchSize: 100,
      leaseSeconds: 120,
      log: (event) => state.calls.push(['log', event]),
    });

    assert.equal(state.calls[0]?.[0], 'heartbeat');
    assert.equal(state.calls[1]?.[0], 'claim');
    assert.deepEqual(handled, [`mandoob:event-job:${ids.job}`]);
    assert.equal(state.calls.at(-1)?.[0], 'succeed');
    assert.deepEqual(result, { claimed: 1, succeeded: 1, failed: 0, leaseLost: 0 });
  });

  test('isolates malformed and unknown-version jobs without logging payloads', async () => {
    const second = job({
      jobId: '88888888-8888-4888-8888-888888888888',
      eventId: '99999999-9999-4999-8999-999999999999',
      leaseToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      eventVersion: 2,
      payload: { private: 'protected payload' },
    });
    const state = harness([
      {
        ok: false,
        lease: { jobId: ids.job, workerId: ids.worker, leaseToken: ids.lease },
        reason: 'malformed_payload',
      },
      {
        ok: false,
        lease: {
          jobId: second.jobId,
          workerId: second.workerId,
          leaseToken: second.leaseToken,
        },
        reason: 'unsupported_version',
      },
    ]);
    await runEventWorkerOnce({
      repository: state.repository,
      handlers: new Map(),
      clock: () => new Date('2026-10-27T10:00:00.000Z'),
      workerId: ids.worker,
      workerName: 'p3-10-worker',
      consumerName: 'internal.test.projection',
      schedulerOwner: 'netlify.event-runtime',
      releaseVersion: 'p3.10-test',
      log: (event) => state.calls.push(['log', event]),
    });

    assert.equal(state.calls.filter(([name]) => name === 'fail').length, 2);
    const failures = state.calls.filter(([name]) => name === 'fail').map((call) => call[4]);
    assert.deepEqual(failures, [
      { category: 'malformed_payload', code: 'EVENT_PAYLOAD_INVALID', retryable: false },
      { category: 'unsupported_version', code: 'EVENT_VERSION_UNSUPPORTED', retryable: false },
    ]);
    assert.equal(JSON.stringify(state.calls).includes('protected payload'), false);
  });

  test('does not acknowledge an already-terminal specialized handler result twice', async () => {
    const state = harness([{ ok: true, job: job() }]);
    const result = await runEventWorkerOnce({
      repository: state.repository,
      handlers: new Map([
        [
          handlerKey('internal.test.projection', 'test.changed', 1),
          async () => ({ outcome: 'already-terminal' as const }),
        ],
      ]),
      clock: () => new Date('2026-10-27T10:00:00.000Z'),
      workerId: ids.worker,
      workerName: 'p3-10-worker',
      consumerName: 'internal.test.projection',
      schedulerOwner: 'netlify.event-runtime',
      releaseVersion: 'p3.10-test',
      log: () => {},
    });
    assert.equal(
      state.calls.some(([name]) => name === 'succeed' || name === 'fail'),
      false,
    );
    assert.deepEqual(result, { claimed: 1, succeeded: 1, failed: 0, leaseLost: 0 });
  });

  test('extends a live lease at handler checkpoints and honors a lost completion fence', async () => {
    let now = new Date('2026-10-27T10:00:00.000Z');
    const state = harness([{ ok: true, job: job() }]);
    state.repository.succeed = async (...args) => (state.calls.push(['succeed', ...args]), false);
    const result = await runEventWorkerOnce({
      repository: state.repository,
      handlers: new Map([
        [
          handlerKey('internal.test.projection', 'test.changed', 1),
          async (_claimed, context) => {
            now = new Date('2026-10-27T10:01:10.000Z');
            await context.checkpoint();
            return {};
          },
        ],
      ]),
      clock: () => now,
      workerId: ids.worker,
      workerName: 'p3-10-worker',
      consumerName: 'internal.test.projection',
      schedulerOwner: 'netlify.event-runtime',
      releaseVersion: 'p3.10-test',
      leaseSeconds: 120,
      log: () => {},
    });

    assert.equal(
      state.calls.some(([name]) => name === 'extend'),
      true,
    );
    assert.equal(result.leaseLost, 1);
  });

  test('rejects oversized batches before any repository call', async () => {
    const state = harness([]);
    await assert.rejects(
      runEventWorkerOnce({
        repository: state.repository,
        handlers: new Map(),
        clock: () => new Date(),
        workerId: ids.worker,
        workerName: 'worker',
        consumerName: 'internal.test.projection',
        schedulerOwner: 'netlify.event-runtime',
        releaseVersion: 'test',
        batchSize: 101,
        log: () => {},
      }),
      /INVALID_BATCH_SIZE/,
    );
    assert.equal(state.calls.length, 0);
  });

  test('preserves typed safe handler failures and sanitizes unknown exceptions', async () => {
    for (const [error, expected] of [
      [
        new EventHandlerFailure({
          category: 'configuration',
          code: 'PROVIDER_CONFIGURATION_INVALID',
          retryable: false,
        }),
        {
          category: 'configuration',
          code: 'PROVIDER_CONFIGURATION_INVALID',
          retryable: false,
        },
      ],
      [
        new Error('Bearer private-token user@example.com'),
        { category: 'unknown', code: 'PROVIDER_FAILURE', retryable: true },
      ],
    ] as const) {
      const state = harness([{ ok: true, job: job() }]);
      await runEventWorkerOnce({
        repository: state.repository,
        handlers: new Map([
          [
            handlerKey('internal.test.projection', 'test.changed', 1),
            async () => Promise.reject(error),
          ],
        ]),
        clock: () => new Date('2026-10-27T10:00:00.000Z'),
        workerId: ids.worker,
        workerName: 'worker',
        consumerName: 'internal.test.projection',
        schedulerOwner: 'netlify.event-runtime',
        releaseVersion: 'test',
        log: (event) => state.calls.push(['log', event]),
      });
      assert.deepEqual(state.calls.find(([name]) => name === 'fail')?.[4], expected);
      assert.equal(JSON.stringify(state.calls).includes('private-token'), false);
    }
  });

  test('stops before claim and before the next claimed unit when deadline is exhausted', async () => {
    let now = new Date('2026-10-27T10:00:00.000Z');
    const expired = harness([]);
    const noClaim = await runEventWorkerOnce({
      repository: expired.repository,
      handlers: new Map(),
      clock: () => now,
      deadlineAt: now.getTime(),
      workerId: ids.worker,
      workerName: 'worker',
      consumerName: 'internal.test.projection',
      schedulerOwner: 'netlify.event-runtime',
      releaseVersion: 'test',
      log: () => {},
    });
    assert.deepEqual(noClaim, { claimed: 0, succeeded: 0, failed: 0, leaseLost: 0 });
    assert.equal(expired.calls.length, 0);

    const expiredAfterHeartbeat = harness([]);
    expiredAfterHeartbeat.repository.heartbeat = async (input) => {
      expiredAfterHeartbeat.calls.push(['heartbeat', input]);
      now = new Date('2026-10-27T10:00:01.000Z');
      return true;
    };
    const noLateClaim = await runEventWorkerOnce({
      repository: expiredAfterHeartbeat.repository,
      handlers: new Map(),
      clock: () => now,
      deadlineAt: Date.parse('2026-10-27T10:00:00.500Z'),
      workerId: ids.worker,
      workerName: 'worker',
      consumerName: 'internal.test.projection',
      schedulerOwner: 'netlify.event-runtime',
      releaseVersion: 'test',
      log: () => {},
    });
    assert.deepEqual(noLateClaim, { claimed: 0, succeeded: 0, failed: 0, leaseLost: 0 });
    assert.equal(
      expiredAfterHeartbeat.calls.some(([name]) => name === 'claim'),
      false,
    );

    now = new Date('2026-10-27T10:00:00.000Z');
    const second = job({ jobId: '88888888-8888-4888-8888-888888888888' });
    const state = harness([
      { ok: true, job: job() },
      { ok: true, job: second },
    ]);
    await runEventWorkerOnce({
      repository: state.repository,
      handlers: new Map([
        [
          handlerKey('internal.test.projection', 'test.changed', 1),
          async () => {
            now = new Date('2026-10-27T10:00:01.000Z');
            return {};
          },
        ],
      ]),
      clock: () => now,
      deadlineAt: Date.parse('2026-10-27T10:00:00.500Z'),
      workerId: ids.worker,
      workerName: 'worker',
      consumerName: 'internal.test.projection',
      schedulerOwner: 'netlify.event-runtime',
      releaseVersion: 'test',
      log: () => {},
    });
    assert.equal(state.calls.filter(([name]) => name === 'succeed').length, 1);
  });
});
