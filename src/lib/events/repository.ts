import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  domainEventEnvelopeSchema,
  hashDestinationKey,
  toSafeProviderFailure,
  type DomainEventEnvelope,
} from './contracts';

type RpcResult = { data: unknown; error: unknown };

export type EventQueueRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const safeCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);
const consumerNameSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/);

export class EventQueueRepositoryError extends Error {
  readonly code = 'EVENT_QUEUE_OPERATION_FAILED';

  constructor() {
    super('Event queue operation failed');
    this.name = 'EventQueueRepositoryError';
  }
}

async function rpcData(
  client: EventQueueRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new EventQueueRepositoryError();
  return data;
}

function hashOpaque(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createEventQueueRepository(client: EventQueueRpcClient) {
  return {
    async publish(envelopeInput: DomainEventEnvelope, dedupeKey: string): Promise<string> {
      const envelope = domainEventEnvelopeSchema.parse(envelopeInput);
      const data = await rpcData(client, 'publish_domain_event', {
        p_event_id: envelope.eventId,
        p_event_type: envelope.eventType,
        p_event_version: envelope.eventVersion,
        p_occurred_at: envelope.occurredAt,
        p_tenant_id: envelope.tenantId,
        p_company_id: envelope.companyId,
        p_actor_id: envelope.actorId,
        p_correlation_id: envelope.correlationId,
        p_causation_id: envelope.causationId,
        p_privacy_class: envelope.privacyClass,
        p_payload: envelope.payload,
        p_dedupe_key: sha256Schema.parse(dedupeKey),
      });
      return uuidSchema.parse(data);
    },

    claim(input: {
      workerId: string;
      consumerName: string;
      batchSize?: number;
      leaseSeconds?: number;
    }): Promise<unknown[]> {
      const batchSize = input.batchSize ?? 25;
      const leaseSeconds = input.leaseSeconds ?? 120;
      if (
        !Number.isInteger(batchSize) ||
        batchSize < 1 ||
        batchSize > 100 ||
        !Number.isInteger(leaseSeconds) ||
        leaseSeconds < 15 ||
        leaseSeconds > 900
      ) {
        throw new Error('INVALID_CLAIM_ARGUMENTS');
      }
      const args = {
        p_worker_id: uuidSchema.parse(input.workerId),
        p_consumer_name: consumerNameSchema.parse(input.consumerName),
        p_batch_size: batchSize,
        p_lease_seconds: leaseSeconds,
      };
      return rpcData(client, 'claim_event_jobs', args).then((data) =>
        z.array(z.record(z.string(), z.unknown())).parse(data),
      );
    },

    async extendLease(
      jobId: string,
      workerId: string,
      leaseToken: string,
      leaseSeconds: number,
    ): Promise<string> {
      if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 900) {
        throw new Error('INVALID_LEASE_SECONDS');
      }
      return z
        .string()
        .datetime({ offset: true })
        .parse(
          await rpcData(client, 'extend_event_job_lease', {
            p_job_id: uuidSchema.parse(jobId),
            p_worker_id: uuidSchema.parse(workerId),
            p_lease_token: uuidSchema.parse(leaseToken),
            p_lease_seconds: leaseSeconds,
          }),
        );
    },

    async succeed(
      jobId: string,
      workerId: string,
      leaseToken: string,
      effectReferenceHash: string | null = null,
    ): Promise<boolean> {
      return z.boolean().parse(
        await rpcData(client, 'complete_event_job', {
          p_job_id: uuidSchema.parse(jobId),
          p_worker_id: uuidSchema.parse(workerId),
          p_lease_token: uuidSchema.parse(leaseToken),
          p_effect_reference_hash:
            effectReferenceHash === null ? null : sha256Schema.parse(effectReferenceHash),
        }),
      );
    },

    async fail(
      jobId: string,
      workerId: string,
      leaseToken: string,
      providerFailure: unknown,
    ): Promise<'retryable' | 'dead'> {
      const failure = toSafeProviderFailure(providerFailure);
      return z.enum(['retryable', 'dead']).parse(
        await rpcData(client, 'fail_event_job', {
          p_job_id: uuidSchema.parse(jobId),
          p_worker_id: uuidSchema.parse(workerId),
          p_lease_token: uuidSchema.parse(leaseToken),
          p_error_category: failure.category,
          p_error_code: failure.code,
          p_retryable: failure.retryable,
        }),
      );
    },

    async cancel(jobId: string, safeCode: string): Promise<boolean> {
      return z.boolean().parse(
        await rpcData(client, 'cancel_event_job', {
          p_job_id: uuidSchema.parse(jobId),
          p_error_code: safeCodeSchema.parse(safeCode),
        }),
      );
    },

    async heartbeat(input: {
      workerId: string;
      workerName: string;
      consumerName: string;
      schedulerOwner: string;
      releaseVersion: string;
      startedAt: string;
    }): Promise<boolean> {
      return z.boolean().parse(
        await rpcData(client, 'record_event_worker_heartbeat', {
          p_worker_id: uuidSchema.parse(input.workerId),
          p_worker_name: input.workerName,
          p_consumer_name: consumerNameSchema.parse(input.consumerName),
          p_scheduler_owner: input.schedulerOwner,
          p_release_version: input.releaseVersion,
          p_started_at: z.string().datetime({ offset: true }).parse(input.startedAt),
        }),
      );
    },

    async requestReplay(jobId: string, operationId: string, reason: string): Promise<string> {
      return uuidSchema.parse(
        await rpcData(client, 'request_event_job_replay', {
          p_source_job_id: uuidSchema.parse(jobId),
          p_operation_id: uuidSchema.parse(operationId),
          p_reason: z.string().trim().min(8).max(240).parse(reason),
        }),
      );
    },

    async reserveInboundWebhook(input: {
      provider: string;
      destinationKey: string;
      providerEventId: string;
      rawPayload: string;
      occurredAt: string;
      signatureVerified: boolean;
    }): Promise<string | null> {
      const data = await rpcData(client, 'reserve_inbound_webhook', {
        p_provider: z
          .string()
          .regex(/^[a-z][a-z0-9_-]{1,31}$/)
          .parse(input.provider),
        p_destination_key_hash: hashDestinationKey(input.provider, input.destinationKey),
        p_provider_event_id_hash: hashOpaque(input.providerEventId),
        p_payload_hash: hashOpaque(input.rawPayload),
        p_occurred_at: z.string().datetime({ offset: true }).parse(input.occurredAt),
        p_signature_verified: input.signatureVerified,
      });
      return data === null ? null : uuidSchema.parse(data);
    },

    async readHealth(consumerName?: string): Promise<Record<string, unknown>> {
      return z.record(z.string(), z.unknown()).parse(
        await rpcData(client, 'read_event_queue_health', {
          p_consumer_name: consumerName ? consumerNameSchema.parse(consumerName) : null,
        }),
      );
    },
  };
}
