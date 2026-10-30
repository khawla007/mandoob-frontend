import 'server-only';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { parseOperationalReport, type OperationalReport } from '@/lib/reporting/runtime-contracts';

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export async function loadOperationalReport(
  actorId: string,
  options: { scope?: 'platform' | 'company'; companyId?: string; client?: Client } = {},
): Promise<OperationalReport> {
  const operationId = randomUUID();
  const { data, error } = await (options.client ?? createSupabaseServiceRoleClient()).rpc(
    'read_p3_12_operational_report' as never,
    {
      p_actor_id: actorId,
      p_scope: options.scope ?? 'platform',
      p_company_id: options.companyId ?? null,
      p_operation_id: operationId,
      p_correlation_id: operationId,
    } as never,
  );
  if (error) throw new ApiError('REPORT_UNAVAILABLE', 'Operational report is unavailable', 503);
  try {
    return parseOperationalReport(data);
  } catch {
    throw new ApiError('REPORT_INVALID', 'Operational report is unavailable', 503);
  }
}

export async function recordReportExport(args: {
  actorId: string;
  rowCount: number;
  fileSizeBytes: number;
  client?: Client;
}): Promise<void> {
  const operationId = randomUUID();
  const { error } = await (args.client ?? createSupabaseServiceRoleClient()).rpc(
    'create_p3_12_report_export' as never,
    {
      p_actor_id: args.actorId,
      p_report_id: 'platform-operations',
      p_company_id: null,
      p_filters: {},
      p_row_count: args.rowCount,
      p_file_size_bytes: args.fileSizeBytes,
      p_operation_id: operationId,
      p_correlation_id: operationId,
    } as never,
  );
  if (error) throw new ApiError('EXPORT_AUDIT_FAILED', 'Report export is unavailable', 503);
}

export type RetentionPolicy = {
  dataClass: string;
  version: number;
  owner: string;
  action: string;
  policyStatus: 'decision_blocked' | 'approved';
  runtimeStatus: 'dry_run' | 'p3_13_pending' | 'enabled';
  destructiveExecutionEnabled: boolean;
};

export async function loadRetentionPolicies(actorId: string): Promise<RetentionPolicy[]> {
  const operationId = randomUUID();
  const { data, error } = await createSupabaseServiceRoleClient().rpc(
    'read_p3_12_retention_registry' as never,
    { p_actor_id: actorId, p_operation_id: operationId, p_correlation_id: operationId } as never,
  );
  if (error) throw new ApiError('RETENTION_UNAVAILABLE', 'Retention registry is unavailable', 503);
  return ((data as unknown as Record<string, unknown>[] | null) ?? []).map((row) => ({
    dataClass: String(row.data_class),
    version: Number(row.version),
    owner: String(row.owner),
    action: String(row.retention_action),
    policyStatus: row.policy_status as RetentionPolicy['policyStatus'],
    runtimeStatus: row.runtime_status as RetentionPolicy['runtimeStatus'],
    destructiveExecutionEnabled: Boolean(row.destructive_execution_enabled),
  }));
}

export type Readiness = {
  generatedAt: string;
  components: Array<{ id: string; state: string; pending?: number; reason?: string }>;
};

export async function loadSystemReadiness(actorId: string): Promise<Readiness> {
  const operationId = randomUUID();
  const { data, error } = await createSupabaseServiceRoleClient().rpc(
    'read_p3_12_readiness' as never,
    { p_actor_id: actorId, p_operation_id: operationId, p_correlation_id: operationId } as never,
  );
  if (error || !data) throw new ApiError('READINESS_UNAVAILABLE', 'Readiness is unavailable', 503);
  return data as unknown as Readiness;
}
