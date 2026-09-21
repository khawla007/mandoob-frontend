import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createEventQueueRepository } from './repository';

const IDS = {
  event: '11111111-1111-4111-8111-111111111111',
  tenant: '22222222-2222-4222-8222-222222222222',
  company: '33333333-3333-4333-8333-333333333333',
  correlation: '44444444-4444-4444-8444-444444444444',
  worker: '55555555-5555-4555-8555-555555555555',
  job: '66666666-6666-4666-8666-666666666666',
  lease: '77777777-7777-4777-8777-777777777777',
  operation: '88888888-8888-4888-8888-888888888888',
} as const;

type Call = { name: string; args: Record<string, unknown> };

function createRpcStub(results: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return { data: results[name] ?? null, error: null };
      },
    },
  };
}

const envelope = {
  eventId: IDS.event,
  eventType: 'documents.requested',
  eventVersion: 1,
  occurredAt: '2026-09-21T04:30:00.000Z',
  tenantId: IDS.tenant,
  companyId: IDS.company,
  actorId: null,
  correlationId: IDS.correlation,
  causationId: null,
  privacyClass: 'confidential',
  payload: { documentRequestId: 'reference-only' },
} as const;

describe('event repository producer and worker contract', () => {
  test('publishes the exact validated envelope and opaque dedupe hash', async () => {
    const stub = createRpcStub({ publish_domain_event: IDS.event });
    const repository = createEventQueueRepository(stub.client);
    const result = await repository.publish(envelope, 'a'.repeat(64));

    assert.equal(result, IDS.event);
    assert.deepEqual(stub.calls[0], {
      name: 'publish_domain_event',
      args: {
        p_event_id: IDS.event,
        p_event_type: 'documents.requested',
        p_event_version: 1,
        p_occurred_at: '2026-09-21T04:30:00.000Z',
        p_tenant_id: IDS.tenant,
        p_company_id: IDS.company,
        p_actor_id: null,
        p_correlation_id: IDS.correlation,
        p_causation_id: null,
        p_privacy_class: 'confidential',
        p_payload: { documentRequestId: 'reference-only' },
        p_dedupe_key: 'a'.repeat(64),
      },
    });
  });

  test('claims only bounded batches and lease durations', async () => {
    const stub = createRpcStub({ claim_event_jobs: [] });
    const repository = createEventQueueRepository(stub.client);

    await repository.claim({
      workerId: IDS.worker,
      consumerName: 'notifications.reference',
      batchSize: 100,
      leaseSeconds: 900,
    });
    assert.equal(stub.calls[0]?.name, 'claim_event_jobs');
    assert.throws(
      () =>
        repository.claim({
          workerId: IDS.worker,
          consumerName: 'notifications.reference',
          batchSize: 101,
          leaseSeconds: 900,
        }),
      /INVALID_CLAIM_ARGUMENTS/,
    );
  });

  test('fences extend and completion with worker plus lease token', async () => {
    const stub = createRpcStub({
      extend_event_job_lease: '2026-09-21T04:32:00.000Z',
      complete_event_job: true,
    });
    const repository = createEventQueueRepository(stub.client);

    await repository.extendLease(IDS.job, IDS.worker, IDS.lease, 120);
    await repository.succeed(IDS.job, IDS.worker, IDS.lease, 'b'.repeat(64));

    assert.deepEqual(
      stub.calls.map((call) => call.name),
      ['extend_event_job_lease', 'complete_event_job'],
    );
    assert.equal(stub.calls[1]?.args.p_effect_reference_hash, 'b'.repeat(64));
  });

  test('sends only allowlisted provider failure fields to the database', async () => {
    const stub = createRpcStub({ fail_event_job: 'retryable' });
    const repository = createEventQueueRepository(stub.client);

    await repository.fail(IDS.job, IDS.worker, IDS.lease, {
      category: 'provider_unavailable',
      code: 'SMTP_TIMEOUT',
      retryable: true,
      message: 'Authorization: Bearer secret user@example.com',
      response: { token: 'secret' },
    });

    assert.deepEqual(stub.calls[0], {
      name: 'fail_event_job',
      args: {
        p_job_id: IDS.job,
        p_worker_id: IDS.worker,
        p_lease_token: IDS.lease,
        p_error_category: 'provider_unavailable',
        p_error_code: 'SMTP_TIMEOUT',
        p_retryable: true,
      },
    });
  });
});

describe('event repository scheduler, replay, and inbound contract', () => {
  test('records ownership-bearing heartbeat and cancellation RPCs', async () => {
    const stub = createRpcStub({
      record_event_worker_heartbeat: true,
      cancel_event_job: true,
    });
    const repository = createEventQueueRepository(stub.client);

    await repository.heartbeat({
      workerId: IDS.worker,
      workerName: 'event-worker-1',
      consumerName: 'notifications.reference',
      schedulerOwner: 'netlify.pending-configuration',
      releaseVersion: 'p3.10-test',
      startedAt: '2026-09-21T04:00:00.000Z',
    });
    await repository.cancel(IDS.job, 'DOMAIN_WORK_CANCELLED');

    assert.deepEqual(
      stub.calls.map((call) => call.name),
      ['record_event_worker_heartbeat', 'cancel_event_job'],
    );
  });

  test('manual replay carries stable operation intent and no authority override', async () => {
    const stub = createRpcStub({ request_event_job_replay: IDS.job });
    const repository = createEventQueueRepository(stub.client);

    await repository.requestReplay(IDS.job, IDS.operation, 'Retry after provider reconciliation');

    assert.deepEqual(stub.calls[0], {
      name: 'request_event_job_replay',
      args: {
        p_source_job_id: IDS.job,
        p_operation_id: IDS.operation,
        p_reason: 'Retry after provider reconciliation',
      },
    });
  });

  test('hashes inbound destination, event, and payload before reserving', async () => {
    const stub = createRpcStub({ reserve_inbound_webhook: IDS.event });
    const repository = createEventQueueRepository(stub.client);

    await repository.reserveInboundWebhook({
      provider: 'twilio',
      destinationKey: '+971501234567',
      providerEventId: 'SM-private-provider-id',
      rawPayload: '{"Body":"protected message"}',
      occurredAt: '2026-09-21T04:30:00.000Z',
      signatureVerified: true,
    });

    const serialized = JSON.stringify(stub.calls[0]);
    assert.equal(serialized.includes('+971501234567'), false);
    assert.equal(serialized.includes('SM-private-provider-id'), false);
    assert.equal(serialized.includes('protected message'), false);
    assert.match(String(stub.calls[0]?.args.p_destination_key_hash), /^[a-f0-9]{64}$/);
    assert.match(String(stub.calls[0]?.args.p_provider_event_id_hash), /^[a-f0-9]{64}$/);
    assert.match(String(stub.calls[0]?.args.p_payload_hash), /^[a-f0-9]{64}$/);
  });

  test('synthetic producer and consumer retain stable event and effect identities', async () => {
    const claimed = {
      job_id: IDS.job,
      event_id: IDS.event,
      effect_key: `mandoob:event-job:${IDS.job}`,
    };
    const stub = createRpcStub({
      publish_domain_event: IDS.event,
      claim_event_jobs: [claimed],
    });
    const repository = createEventQueueRepository(stub.client);

    assert.equal(await repository.publish(envelope, 'c'.repeat(64)), IDS.event);
    const jobs = await repository.claim({
      workerId: IDS.worker,
      consumerName: 'notifications.reference',
      batchSize: 1,
      leaseSeconds: 120,
    });
    assert.deepEqual(jobs, [claimed]);
  });
});
