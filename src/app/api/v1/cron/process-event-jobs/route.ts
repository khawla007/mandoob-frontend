import { createHash, randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { createSupabaseImportWorkerDeps } from '@/lib/employees/import-worker-supabase';
import { createEventQueueRepository } from '@/lib/events/repository';
import {
  RUNTIME_EVENT_SCHEMAS,
  createEmployeeImportEventHandler,
  createMeetingAiEventHandler,
  createRuntimeHandlerRegistry,
  scheduledRuntimeConsumers,
} from '@/lib/events/runtime-handlers';
import { runEventWorkerOnce } from '@/lib/events/worker';
import { createSupabaseMeetingAiWorkerDeps } from '@/lib/meetings/ai-worker-supabase';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { createProcessEventJobsHandler } from './route-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RELEASE_VERSION = 'p3.10-runtime-v1';

async function runConsumer(consumerName: string, options: { owner: string; batchSize: number }) {
  const workerId = randomUUID();
  const admin = createSupabaseServiceRoleClient();
  const repository = createEventQueueRepository(admin, RUNTIME_EVENT_SCHEMAS);
  let importDepsPromise: ReturnType<typeof createSupabaseImportWorkerDeps> | undefined;
  const registry = createRuntimeHandlerRegistry({
    async writeProjection(projection) {
      const { data, error } = await admin.rpc('write_operational_projection', {
        p_operation_id: projection.operationId,
        p_tenant_id: projection.tenantId,
        p_company_id: projection.companyId,
        p_event_id: projection.eventId,
        p_job_id: projection.jobId,
        p_worker_id: projection.workerId,
        p_lease_token: projection.leaseToken,
        p_projection_type: projection.projectionType,
        p_projection_key: projection.projectionKey,
        p_code: projection.code,
        p_profile_id: projection.profileId,
        p_state: projection.state,
        p_priority: projection.priority,
        p_due_at: projection.dueAt,
        p_safe_metadata: projection.safeMetadata,
      });
      if (error) throw new Error('RUNTIME_PROJECTION_FAILED');
      const projectionId = (data as { projectionId?: unknown } | null)?.projectionId;
      return typeof projectionId === 'string'
        ? { effectReferenceHash: createHash('sha256').update(projectionId).digest('hex') }
        : {};
    },
    employeeImport: createEmployeeImportEventHandler(async () => {
      importDepsPromise ??= createSupabaseImportWorkerDeps({
        workerId,
        batchSize: options.batchSize,
      });
      return importDepsPromise;
    }),
    // Real P3.11 adapter remains registry-only; its consumer is not scheduled.
    meetingAi: createMeetingAiEventHandler(async () =>
      createSupabaseMeetingAiWorkerDeps({ workerId, batchSize: 1 }),
    ),
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
    log: (event) => console.error(event),
  });
}

export const POST = createProcessEventJobsHandler({
  configuredSecret: env.CRON_SECRET,
  consumers: scheduledRuntimeConsumers,
  runConsumer,
});
