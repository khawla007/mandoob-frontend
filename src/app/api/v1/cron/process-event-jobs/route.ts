import { createHash, randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { createSupabaseImportWorkerDeps } from '@/lib/employees/import-worker-supabase';
import { createEventQueueRepository } from '@/lib/events/repository';
import { RuntimeRpcError, createRuntimeRpc } from '@/lib/events/runtime-rpc';
import {
  RUNTIME_EVENT_SCHEMAS,
  createEmployeeImportEventHandler,
  createMeetingAiEventHandler,
  createRuntimeHandlerRegistry,
  scheduledRuntimeConsumers,
} from '@/lib/events/runtime-handlers';
import { EventHandlerFailure, runEventWorkerOnce } from '@/lib/events/worker';
import { createSupabaseMeetingAiWorkerDeps } from '@/lib/meetings/ai-worker-supabase';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { createProcessEventJobsHandler } from './route-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RELEASE_VERSION = 'p3.10-runtime-v1';

async function runConsumer(
  consumerName: string,
  options: {
    owner: string;
    batchSize: number;
    signal: AbortSignal;
    deadlineAt: number;
  },
) {
  const workerId = randomUUID();
  const admin = createSupabaseServiceRoleClient({ signal: options.signal });
  const repository = createEventQueueRepository(admin, RUNTIME_EVENT_SCHEMAS);
  const runtimeRpc = createRuntimeRpc(admin);
  let importDepsPromise: ReturnType<typeof createSupabaseImportWorkerDeps> | undefined;
  const registry = createRuntimeHandlerRegistry({
    async writeProjection(projection) {
      try {
        const result = await runtimeRpc.writeProjection(projection);
        return {
          effectReferenceHash: createHash('sha256').update(result.projectionId).digest('hex'),
        };
      } catch (error) {
        if (error instanceof RuntimeRpcError) throw new EventHandlerFailure(error.failure);
        throw error;
      }
    },
    employeeImport: createEmployeeImportEventHandler(async () => {
      importDepsPromise ??= createSupabaseImportWorkerDeps({
        workerId,
        batchSize: options.batchSize,
        signal: options.signal,
      });
      return importDepsPromise;
    }),
    // Real P3.11 adapter remains registry-only; its consumer is not scheduled.
    meetingAi: createMeetingAiEventHandler(async () => {
      const deps = createSupabaseMeetingAiWorkerDeps({
        workerId,
        batchSize: 1,
        signal: options.signal,
      });
      return {
        ...deps,
        cancel: async (claim, code) => {
          try {
            return await runtimeRpc.cancelLeasedJob({
              jobId: claim.eventJobId,
              workerId,
              leaseToken: claim.leaseToken,
              safeCode: code,
            });
          } catch (error) {
            if (error instanceof RuntimeRpcError) throw new EventHandlerFailure(error.failure);
            throw error;
          }
        },
      };
    }),
  });
  return runEventWorkerOnce({
    repository,
    handlers: registry.handlers,
    clock: () => new Date(),
    workerId,
    workerName: 'mandoob-event-runtime',
    consumerName,
    schedulerOwner: options.owner,
    releaseVersion: RELEASE_VERSION,
    batchSize: options.batchSize,
    leaseSeconds: consumerName === 'p308.employee_import.executor' ? 300 : 120,
    deadlineAt: options.deadlineAt,
    signal: options.signal,
    log: (event) => console.error(event),
  });
}

export const POST = createProcessEventJobsHandler({
  cutoverValue: env.EVENT_RUNTIME_SCHEDULER_CUTOVER,
  configuredSecret: env.CRON_SECRET,
  consumers: scheduledRuntimeConsumers,
  runConsumer,
});
