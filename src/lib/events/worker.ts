import type { SafeProviderFailure } from './contracts';
import type { ClaimedEventJob, ClaimedEventJobResult } from './repository';

export type EventHandlerContext = { checkpoint(): Promise<void>; signal?: AbortSignal };
export type EventJobHandler = (
  job: ClaimedEventJob,
  context: EventHandlerContext,
) => Promise<{
  effectReferenceHash?: string;
  outcome?: 'complete' | 'already-terminal' | 'lease-lost';
}>;

export type EventWorkerRepository = {
  heartbeat(input: {
    workerId: string;
    workerName: string;
    consumerName: string;
    schedulerOwner: string;
    releaseVersion: string;
    startedAt: string;
  }): Promise<boolean>;
  claim(input: {
    workerId: string;
    consumerName: string;
    batchSize?: number;
    leaseSeconds?: number;
  }): Promise<ClaimedEventJobResult[]>;
  extendLease(
    jobId: string,
    workerId: string,
    leaseToken: string,
    leaseSeconds: number,
  ): Promise<string>;
  succeed(
    jobId: string,
    workerId: string,
    leaseToken: string,
    effectReferenceHash?: string | null,
  ): Promise<boolean>;
  fail(
    jobId: string,
    workerId: string,
    leaseToken: string,
    failure: SafeProviderFailure,
  ): Promise<'retryable' | 'dead'>;
};

export function handlerKey(consumerName: string, eventType: string, eventVersion: number): string {
  return `${consumerName}\0${eventType}\0${eventVersion}`;
}

const nonRetryableConfigurationFailure: SafeProviderFailure = {
  category: 'configuration',
  code: 'PROVIDER_CONFIGURATION_INVALID',
  retryable: false,
};
const retryableRuntimeFailure: SafeProviderFailure = {
  category: 'unknown',
  code: 'PROVIDER_FAILURE',
  retryable: true,
};
const malformedPayloadFailure: SafeProviderFailure = {
  category: 'malformed_payload',
  code: 'EVENT_PAYLOAD_INVALID',
  retryable: false,
};
const unsupportedVersionFailure: SafeProviderFailure = {
  category: 'unsupported_version',
  code: 'EVENT_VERSION_UNSUPPORTED',
  retryable: false,
};

export class EventHandlerFailure extends Error {
  constructor(readonly failure: SafeProviderFailure) {
    super('EVENT_HANDLER_FAILED');
    this.name = 'EventHandlerFailure';
  }
}

class WorkerDeadlineExceeded extends Error {}

export async function runEventWorkerOnce(input: {
  repository: EventWorkerRepository;
  handlers: ReadonlyMap<string, EventJobHandler>;
  clock: () => Date;
  workerId: string;
  workerName: string;
  consumerName: string;
  schedulerOwner: string;
  releaseVersion: string;
  batchSize?: number;
  leaseSeconds?: number;
  deadlineAt?: number;
  signal?: AbortSignal;
  log(event: string): void;
}): Promise<{ claimed: number; succeeded: number; failed: number; leaseLost: number }> {
  const batchSize = input.batchSize ?? 25;
  const leaseSeconds = input.leaseSeconds ?? 120;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error('INVALID_BATCH_SIZE');
  }
  const deadlineExceeded = () =>
    input.signal?.aborted === true ||
    (input.deadlineAt !== undefined && input.clock().getTime() >= input.deadlineAt);
  if (deadlineExceeded()) {
    return { claimed: 0, succeeded: 0, failed: 0, leaseLost: 0 };
  }
  const startedAt = input.clock().toISOString();
  await input.repository.heartbeat({
    workerId: input.workerId,
    workerName: input.workerName,
    consumerName: input.consumerName,
    schedulerOwner: input.schedulerOwner,
    releaseVersion: input.releaseVersion,
    startedAt,
  });
  if (deadlineExceeded()) {
    return { claimed: 0, succeeded: 0, failed: 0, leaseLost: 0 };
  }
  const claimed = await input.repository.claim({
    workerId: input.workerId,
    consumerName: input.consumerName,
    batchSize,
    leaseSeconds,
  });
  const summary = { claimed: claimed.length, succeeded: 0, failed: 0, leaseLost: 0 };
  const failSafely = async (
    lease: { jobId: string; workerId: string; leaseToken: string },
    failure: SafeProviderFailure,
  ) => {
    try {
      await input.repository.fail(lease.jobId, lease.workerId, lease.leaseToken, failure);
      summary.failed += 1;
    } catch {
      input.log('event-worker.failure-fence-lost');
      summary.leaseLost += 1;
    }
  };

  for (const result of claimed) {
    if (deadlineExceeded()) break;
    if (!result.ok) {
      input.log('event-worker.claim-invalid');
      if (result.lease) {
        await failSafely(
          result.lease,
          result.reason === 'unsupported_version'
            ? unsupportedVersionFailure
            : malformedPayloadFailure,
        );
      }
      continue;
    }
    const job = result.job;
    if (job.workerId !== input.workerId || job.consumerName !== input.consumerName) {
      input.log('event-worker.claim-scope-invalid');
      await failSafely(job, nonRetryableConfigurationFailure);
      continue;
    }
    const handler = input.handlers.get(
      handlerKey(job.consumerName, job.eventType, job.eventVersion),
    );
    if (!handler) {
      input.log('event-worker.handler-unsupported');
      await failSafely(job, unsupportedVersionFailure);
      continue;
    }
    let leaseExpiresAt = Date.parse(job.leaseExpiresAt);
    const checkpoint = async () => {
      if (deadlineExceeded()) throw new WorkerDeadlineExceeded();
      if (input.clock().getTime() < leaseExpiresAt - leaseSeconds * 500) return;
      leaseExpiresAt = Date.parse(
        await input.repository.extendLease(job.jobId, job.workerId, job.leaseToken, leaseSeconds),
      );
    };
    try {
      const handled = await handler(job, { checkpoint, signal: input.signal });
      if (handled.outcome === 'already-terminal') {
        summary.succeeded += 1;
        continue;
      }
      if (handled.outcome === 'lease-lost') {
        summary.leaseLost += 1;
        continue;
      }
      const completed = await input.repository.succeed(
        job.jobId,
        job.workerId,
        job.leaseToken,
        handled.effectReferenceHash ?? null,
      );
      if (completed) summary.succeeded += 1;
      else summary.leaseLost += 1;
    } catch (error) {
      if (error instanceof WorkerDeadlineExceeded) {
        input.log('event-worker.deadline-exhausted');
        break;
      }
      input.log('event-worker.handler-failed');
      const failure =
        error instanceof EventHandlerFailure ? error.failure : retryableRuntimeFailure;
      await failSafely(job, {
        ...failure,
        retryable: failure.retryable && job.attemptNumber < job.maxAttempts,
      });
    }
  }
  return summary;
}
