import { z } from 'zod';
import type { SafeProviderFailure } from './contracts';
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
  constructor(readonly failure: SafeProviderFailure) {
    super('RUNTIME_RPC_FAILED');
    this.name = 'RuntimeRpcError';
  }
}

const malformedFailure: SafeProviderFailure = {
  category: 'malformed_payload',
  code: 'EVENT_PAYLOAD_INVALID',
  retryable: false,
};
const configurationFailure: SafeProviderFailure = {
  category: 'configuration',
  code: 'PROVIDER_CONFIGURATION_INVALID',
  retryable: false,
};
const unavailableFailure: SafeProviderFailure = {
  category: 'provider_unavailable',
  code: 'PROVIDER_UNAVAILABLE',
  retryable: true,
};
const timeoutFailure: SafeProviderFailure = {
  category: 'timeout',
  code: 'PROVIDER_TIMEOUT',
  retryable: true,
};
const deterministicSqlCodes = new Set(['22023', '42501', 'P3101', 'P3102']);
const deterministicRuntimeCodes = new Set([
  'RUNTIME_ACCESS_DENIED',
  'RUNTIME_ATTEMPT_MISMATCH',
  'RUNTIME_IDEMPOTENCY_CONFLICT',
  'RUNTIME_INVALID_CHANNEL',
  'RUNTIME_INVALID_CURSOR',
  'RUNTIME_INVALID_OPERATION',
  'RUNTIME_INVALID_PROJECTION',
  'RUNTIME_INVALID_RECEIPT',
  'RUNTIME_OPERATION_REUSED',
  'RUNTIME_RECIPIENT_REQUIRED',
  'RUNTIME_RECIPIENT_SCOPE_DENIED',
  'RUNTIME_REFERENCE_SCOPE_DENIED',
]);

function classifyFailure(error: unknown): SafeProviderFailure {
  if (error instanceof z.ZodError) return malformedFailure;
  const parsed = z
    .object({ code: z.string().min(1), message: z.string().optional() })
    .passthrough()
    .safeParse(error);
  if (!parsed.success) return unavailableFailure;
  const { code, message } = parsed.data;
  if (code === '57014') return timeoutFailure;
  if (
    deterministicSqlCodes.has(code) ||
    (message !== undefined && deterministicRuntimeCodes.has(message))
  ) {
    return configurationFailure;
  }
  return unavailableFailure;
}

export function createRuntimeRpc(client: RuntimeRpcClient) {
  const classified = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof RuntimeRpcError) throw error;
      throw new RuntimeRpcError(classifyFailure(error));
    }
  };
  const call = async (name: string, args: Record<string, unknown>) => {
    try {
      const result = await client.rpc(name, args);
      if (result.error) throw new RuntimeRpcError(classifyFailure(result.error));
      return result.data;
    } catch (error) {
      if (error instanceof RuntimeRpcError) throw error;
      throw new RuntimeRpcError(classifyFailure(error));
    }
  };
  return {
    async writeProjection(input: ProjectionWrite) {
      return classified(async () =>
        projectionResultSchema.parse(
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
        ),
      );
    },
    async cancelLeasedJob(input: {
      jobId: string;
      workerId: string;
      leaseToken: string;
      safeCode: string;
    }) {
      return classified(async () =>
        z.boolean().parse(
          await call('cancel_leased_event_job', {
            p_job_id: z.string().uuid().parse(input.jobId),
            p_worker_id: z.string().uuid().parse(input.workerId),
            p_lease_token: z.string().uuid().parse(input.leaseToken),
            p_error_code: safeCodeSchema.parse(input.safeCode),
          }),
        ),
      );
    },
  };
}
