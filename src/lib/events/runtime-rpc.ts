import { z } from 'zod';
import type { ProjectionWrite } from './runtime-handlers';

type RpcResult = { data: unknown; error: unknown };
export type RuntimeRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

const projectionResultSchema = z
  .object({
    state: z.enum(['applied', 'replayed']),
    projectionType: z.enum(['notification', 'task', 'activity']),
    projectionId: z.string().uuid(),
  })
  .strict();
const safeCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);

export class RuntimeRpcError extends Error {
  constructor() {
    super('RUNTIME_RPC_FAILED');
    this.name = 'RuntimeRpcError';
  }
}

export function createRuntimeRpc(client: RuntimeRpcClient) {
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.rpc(name, args);
    if (result.error) throw new RuntimeRpcError();
    return result.data;
  };
  return {
    async writeProjection(input: ProjectionWrite) {
      try {
        return projectionResultSchema.parse(
          await call('write_operational_projection', {
            p_operation_id: input.operationId,
            p_tenant_id: input.tenantId,
            p_company_id: input.companyId,
            p_event_id: input.eventId,
            p_job_id: input.jobId,
            p_worker_id: input.workerId,
            p_lease_token: input.leaseToken,
            p_projection_type: input.projectionType,
            p_projection_key: input.projectionKey,
            p_code: input.code,
            p_profile_id: input.profileId,
            p_state: input.state,
            p_priority: input.priority,
            p_due_at: input.dueAt,
            p_safe_metadata: input.safeMetadata,
          }),
        );
      } catch {
        throw new RuntimeRpcError();
      }
    },
    async cancelLeasedJob(input: {
      jobId: string;
      workerId: string;
      leaseToken: string;
      safeCode: string;
    }) {
      try {
        return z.boolean().parse(
          await call('cancel_leased_event_job', {
            p_job_id: z.string().uuid().parse(input.jobId),
            p_worker_id: z.string().uuid().parse(input.workerId),
            p_lease_token: z.string().uuid().parse(input.leaseToken),
            p_error_code: safeCodeSchema.parse(input.safeCode),
          }),
        );
      } catch {
        throw new RuntimeRpcError();
      }
    },
  };
}
