import { payloadHash } from '@/lib/p308/operation';
import { callP308, type P308Actor, type P308RpcClient } from '@/lib/p308/rpc';
import type { ImportRowError } from './import-csv';

export type ImportReceipt = { job_id: string; version: number; status?: string; replayed: boolean };

export function importArtifactPath(actor: P308Actor, jobId: string): string {
  return `${actor.tenantId}/${actor.companyId}/${jobId}.csv.enc`;
}

export async function registerImport(
  client: P308RpcClient,
  actor: P308Actor,
  input: { operationId: string; jobId: string; sha256: string; bytes: number },
): Promise<ImportReceipt> {
  return callP308(client, 'p308_register_import', {
    p_actor_id: actor.actorId,
    p_operation_id: input.operationId,
    p_payload_hash: payloadHash({ sha256: input.sha256, bytes: input.bytes, jobId: input.jobId }),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_job_id: input.jobId,
    p_storage_path: importArtifactPath(actor, input.jobId),
    p_artifact_sha256: input.sha256,
    p_artifact_bytes: input.bytes,
  });
}

export async function recordImportArtifactAccess(
  client: P308RpcClient,
  input: {
    jobId: string;
    actorId: string | null;
    workerId: string | null;
    purpose: 'validate' | 'execute' | 'cleanup';
    sha256: string;
  },
): Promise<void> {
  await callP308(client, 'p308_record_import_artifact_access', {
    p_job_id: input.jobId,
    p_actor_id: input.actorId,
    p_worker_id: input.workerId,
    p_purpose: input.purpose,
    p_artifact_sha256: input.sha256,
  });
}

export async function recordImportValidation(
  client: P308RpcClient,
  actor: P308Actor,
  input: {
    operationId: string;
    jobId: string;
    expectedVersion: number;
    totalRows: number;
    errorRows: number;
    errors: ImportRowError[];
  },
): Promise<ImportReceipt & { total_rows: number; error_rows: number }> {
  const errors = input.errors.slice(0, 500);
  return callP308(client, 'p308_record_import_validation', {
    p_actor_id: actor.actorId,
    p_operation_id: input.operationId,
    p_payload_hash: payloadHash({ ...input, errors, operationId: undefined }),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_job_id: input.jobId,
    p_expected_version: input.expectedVersion,
    p_total_rows: input.totalRows,
    p_error_rows: input.errorRows,
    p_errors: errors,
  });
}

async function jobCommand(
  client: P308RpcClient,
  fn: 'p308_request_import_execution' | 'p308_cancel_import',
  actor: P308Actor,
  input: { operationId: string; jobId: string; expectedVersion: number },
): Promise<ImportReceipt> {
  return callP308(client, fn, {
    p_actor_id: actor.actorId,
    p_operation_id: input.operationId,
    p_payload_hash: payloadHash({ fn, jobId: input.jobId, expectedVersion: input.expectedVersion }),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_job_id: input.jobId,
    p_expected_version: input.expectedVersion,
  });
}

export const requestImportExecution = (
  client: P308RpcClient,
  actor: P308Actor,
  input: { operationId: string; jobId: string; expectedVersion: number },
) => jobCommand(client, 'p308_request_import_execution', actor, input);

export const cancelImport = (
  client: P308RpcClient,
  actor: P308Actor,
  input: { operationId: string; jobId: string; expectedVersion: number },
) => jobCommand(client, 'p308_cancel_import', actor, input);
