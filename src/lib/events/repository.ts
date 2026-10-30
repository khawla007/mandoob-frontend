import { z } from 'zod';
import {
  parseRegisteredDomainEvent,
  toSafeProviderFailure,
  type DomainEventEnvelope,
  type EventSchemaRegistry,
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

const claimedEventJobRowSchema = z
  .object({
    job_id: uuidSchema,
    event_id: uuidSchema,
    consumer_name: consumerNameSchema,
    attempt_number: z.number().int().min(1).max(32_767),
    max_attempts: z.number().int().min(1).max(32_767),
    lease_token: uuidSchema,
    lease_expires_at: z.string().datetime({ offset: true }),
    effect_key: z
      .string()
      .regex(
        /^mandoob:event-job:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    event_type: z
      .string()
      .min(3)
      .max(160)
      .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
    event_version: z.number().int().min(1).max(32_767),
    occurred_at: z.string().datetime({ offset: true }),
    tenant_id: uuidSchema.nullable(),
    company_id: uuidSchema.nullable(),
    actor_id: uuidSchema.nullable(),
    correlation_id: uuidSchema,
    causation_id: uuidSchema.nullable(),
    privacy_class: z.enum(['public', 'internal', 'confidential', 'restricted']),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.attempt_number > row.max_attempts) {
      context.addIssue({
        code: 'custom',
        path: ['attempt_number'],
        message: 'attempt exceeds max',
      });
    }
  });

const claimedLeaseSchema = z.object({ job_id: uuidSchema, lease_token: uuidSchema }).passthrough();

export type ClaimedEventJob = {
  jobId: string;
  eventId: string;
  workerId: string;
  consumerName: string;
  attemptNumber: number;
  maxAttempts: number;
  leaseToken: string;
  leaseExpiresAt: string;
  effectKey: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  tenantId: string | null;
  companyId: string | null;
  actorId: string | null;
  correlationId: string;
  causationId: string | null;
  privacyClass: 'public' | 'internal' | 'confidential' | 'restricted';
  payload: Record<string, unknown>;
};

export type ClaimedEventJobResult =
  | { ok: true; job: ClaimedEventJob }
  | {
      ok: false;
      lease: { jobId: string; workerId: string; leaseToken: string } | null;
      reason: 'malformed_payload' | 'unsupported_version';
    };

function decodeClaimedEventJob(
  input: unknown,
  workerId: string,
  eventSchemas: EventSchemaRegistry,
): ClaimedEventJobResult {
  const parsed = claimedEventJobRowSchema.safeParse(input);
  if (!parsed.success) {
    const lease = claimedLeaseSchema.safeParse(input);
    return {
      ok: false,
      reason: 'malformed_payload',
      lease: lease.success
        ? { jobId: lease.data.job_id, workerId, leaseToken: lease.data.lease_token }
        : null,
    };
  }
  const row = parsed.data;
  try {
    const envelope = parseRegisteredDomainEvent(
      {
        eventId: row.event_id,
        eventType: row.event_type,
        eventVersion: row.event_version,
        occurredAt: row.occurred_at,
        tenantId: row.tenant_id,
        companyId: row.company_id,
        actorId: row.actor_id,
        correlationId: row.correlation_id,
        causationId: row.causation_id,
        privacyClass: row.privacy_class,
        payload: row.payload,
      },
      eventSchemas,
    );
    return {
      ok: true,
      job: {
        jobId: row.job_id,
        eventId: envelope.eventId,
        workerId,
        consumerName: row.consumer_name,
        attemptNumber: row.attempt_number,
        maxAttempts: row.max_attempts,
        leaseToken: row.lease_token,
        leaseExpiresAt: row.lease_expires_at,
        effectKey: row.effect_key,
        eventType: envelope.eventType,
        eventVersion: envelope.eventVersion,
        occurredAt: envelope.occurredAt,
        tenantId: envelope.tenantId,
        companyId: envelope.companyId,
        actorId: envelope.actorId,
        correlationId: envelope.correlationId,
        causationId: envelope.causationId,
        privacyClass: envelope.privacyClass,
        payload: envelope.payload,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        (error as Error | null)?.message === 'EVENT_VERSION_UNSUPPORTED'
          ? 'unsupported_version'
          : 'malformed_payload',
      lease: { jobId: row.job_id, workerId, leaseToken: row.lease_token },
    };
  }
}

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

export function createEventQueueRepository(
  client: EventQueueRpcClient,
  eventSchemas: EventSchemaRegistry,
) {
  return {
    async publish(envelopeInput: DomainEventEnvelope, dedupeKey: string): Promise<string> {
      const envelope = parseRegisteredDomainEvent(envelopeInput, eventSchemas);
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
    }): Promise<ClaimedEventJobResult[]> {
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
        z
          .array(z.unknown())
          .parse(data)
          .map((row) => decodeClaimedEventJob(row, input.workerId, eventSchemas)),
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

    async readHealth(consumerName?: string): Promise<Record<string, unknown>> {
      return z.record(z.string(), z.unknown()).parse(
        await rpcData(client, 'read_event_queue_health', {
          p_consumer_name: consumerName ? consumerNameSchema.parse(consumerName) : null,
        }),
      );
    },
  };
}
