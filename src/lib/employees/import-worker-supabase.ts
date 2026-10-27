import 'server-only';

import { randomUUID } from 'node:crypto';
import { callP308, type P308RpcClient } from '@/lib/p308/rpc';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { decryptImportArtifact, loadImportArtifactKey } from './import-artifact';
import { recordImportArtifactAccess } from './import-commands';
import type { ImportEmployeeValue } from './import-csv';
import { IMPORT_CONSUMER, type ImportClaim, type ImportWorkerDeps } from './import-worker';

type Claimed = {
  job_id: string;
  lease_token: string;
  attempt_number: number;
  max_attempts: number;
  payload: { resource_id?: string };
};

/** Production wiring for the P3.08 import consumer (service role only). */
export async function createSupabaseImportWorkerDeps(
  options: {
    workerId?: string;
    batchSize?: number;
    leaseSeconds?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ImportWorkerDeps> {
  const admin = createSupabaseServiceRoleClient({ signal: options.signal });
  const client = admin as unknown as P308RpcClient;
  const workerId = options.workerId ?? randomUUID();
  const key = loadImportArtifactKey();
  const [{ encrypt }, { hashPassportForLookup }, { sealEmployeeIdentifiers }] = await Promise.all([
    import('@/lib/crypto/pii'),
    import('@/lib/crypto/passport-lookup'),
    import('./identifiers'),
  ]);
  const lease = (claim: ImportClaim) => ({
    p_job_id: claim.importJobId,
    p_worker_id: workerId,
    p_lease_token: claim.leaseToken,
  });
  return {
    workerId,
    claim: async () => {
      const rows = await callP308<Claimed[]>(client, 'claim_event_jobs', {
        p_worker_id: workerId,
        p_consumer_name: IMPORT_CONSUMER,
        p_batch_size: options.batchSize ?? 5,
        p_lease_seconds: options.leaseSeconds ?? 300,
      });
      return (rows ?? [])
        .filter((row) => typeof row.payload?.resource_id === 'string')
        .map((row) => ({
          eventJobId: row.job_id,
          leaseToken: row.lease_token,
          importJobId: row.payload.resource_id as string,
          attempt: Number(row.attempt_number),
          maxAttempts: Number(row.max_attempts),
        }));
    },
    readExecution: async (claim) => {
      const row = await callP308<Record<string, unknown>>(
        client,
        'p308_read_import_execution',
        lease(claim),
      );
      return {
        status: String(row.status),
        tenantId: String(row.tenant_id),
        companyId: String(row.company_id),
        storagePath: String(row.storage_path),
        artifactSha256: String(row.artifact_sha256),
        totalRows: Number(row.total_rows ?? 0),
        nextRow: Number(row.next_row ?? 0),
        nextBatch: Number(row.next_batch ?? 0),
        cancelRequested: row.cancel_requested === true,
      };
    },
    downloadArtifact: async (path) => {
      const { data, error } = await admin.storage.from('tenant-imports').download(path);
      const status = (error as { status?: number; statusCode?: string | number } | null) ?? null;
      if (
        status &&
        (status.status === 400 || status.status === 404 || String(status.statusCode) === '404')
      ) {
        throw new Error('IMPORT_ARTIFACT_MISSING');
      }
      if (error || !data) throw new Error('IMPORT_ARTIFACT_UNAVAILABLE');
      return new Uint8Array(await data.arrayBuffer());
    },
    decryptArtifact: (sealed) => decryptImportArtifact(sealed, key),
    recordAccess: (claim, sha256) =>
      recordImportArtifactAccess(client, {
        jobId: claim.importJobId,
        actorId: null,
        workerId,
        purpose: 'execute',
        sha256,
      }),
    sealEmployee: (companyId, value: ImportEmployeeValue) => {
      const optional = (input: string | undefined) => (input ? input : null);
      return Object.fromEntries(
        Object.entries({
          name: value.name,
          email: optional(value.email),
          phone: optional(value.phone),
          nationality: optional(value.nationality),
          job_title: optional(value.job_title),
          visa_expiry: optional(value.visa_expiry),
          eid_expiry: optional(value.eid_expiry),
          ...sealEmployeeIdentifiers(
            companyId,
            {
              ...(value.passport_no ? { passport_no: value.passport_no } : {}),
              ...(value.visa_no ? { visa_no: value.visa_no } : {}),
              ...(value.emirates_id ? { emirates_id: value.emirates_id } : {}),
            },
            { encrypt, hashPassport: hashPassportForLookup },
          ),
        }).filter(([, entry]) => entry !== null),
      );
    },
    applyBatch: (claim, batchNo, firstRow, rows) =>
      callP308(client, 'p308_apply_import_batch', {
        ...lease(claim),
        p_batch_no: batchNo,
        p_first_row: firstRow,
        p_rows: rows,
      }),
    finalize: (claim, failureCode) =>
      callP308(client, 'p308_finalize_import', { ...lease(claim), p_failure_code: failureCode }),
    complete: async (claim) => {
      await callP308(client, 'complete_event_job', {
        p_job_id: claim.eventJobId,
        p_worker_id: workerId,
        p_lease_token: claim.leaseToken,
        p_effect_reference_hash: null,
      });
    },
    fail: async (claim, retryable) => {
      await callP308(client, 'fail_event_job', {
        p_job_id: claim.eventJobId,
        p_worker_id: workerId,
        p_lease_token: claim.leaseToken,
        p_error_category: 'unknown',
        p_error_code: 'PROVIDER_FAILURE',
        p_retryable: retryable,
      });
    },
    reconcile: () => callP308<number>(client, 'p308_reconcile_stuck_imports', { p_limit: 50 }),
    log: (event) => console.error(event),
  };
}
