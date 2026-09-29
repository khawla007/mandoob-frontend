import { sha256Hex } from './import-artifact';
import {
  validateEmployeeImportBytes,
  type ImportEmployeeValue,
  type ImportRow,
} from './import-csv';

/**
 * P3.08 employee-import consumer over the P3.10 v1.0.0 leased job interface.
 * Each claimed `employee.import.requested` job is processed in atomic,
 * idempotent batches keyed by batch number and fenced by the lease token.
 * A crash leaves the durable cursor in `bulk_import_jobs`; the next lease
 * resumes from it. Scheduling this consumer belongs to P3.10.
 */
export const IMPORT_BATCH_SIZE = 100;
export const IMPORT_CONSUMER = 'p308.employee_import.executor';

export type ImportClaim = {
  eventJobId: string;
  leaseToken: string;
  importJobId: string;
  /** P3.10 attempt number of this lease (1-based) and the consumer's limit. */
  attempt: number;
  maxAttempts: number;
};
export type ImportExecution = {
  status: 'importing' | 'completed' | 'cancelled' | 'failed' | string;
  tenantId: string;
  companyId: string;
  storagePath: string;
  artifactSha256: string;
  totalRows: number;
  nextRow: number;
  nextBatch: number;
  cancelRequested: boolean;
};
export type ImportBatchRow =
  | { row_number: number; outcome: 'valid'; employee: Record<string, unknown> }
  | { row_number: number; outcome: 'invalid' | 'duplicate_in_file'; error_code: string };
export type ImportBatchResult = { state: 'applied' | 'replayed' | 'cancel_requested' | 'failed' };

export type ImportWorkerDeps = {
  workerId: string;
  claim(): Promise<ImportClaim[]>;
  readExecution(claim: ImportClaim): Promise<ImportExecution>;
  downloadArtifact(path: string): Promise<Uint8Array>;
  decryptArtifact(sealed: Uint8Array): Uint8Array;
  recordAccess(claim: ImportClaim, sha256: string): Promise<void>;
  sealEmployee(companyId: string, value: ImportEmployeeValue): Record<string, unknown>;
  applyBatch(
    claim: ImportClaim,
    batchNo: number,
    firstRow: number,
    rows: ImportBatchRow[],
  ): Promise<ImportBatchResult>;
  finalize(claim: ImportClaim, failureCode: string | null): Promise<{ state: string }>;
  complete(claim: ImportClaim): Promise<void>;
  fail(claim: ImportClaim, retryable: boolean): Promise<void>;
  /** Closes imports whose P3.10 execution job is dead (`p308_reconcile_stuck_imports`). */
  reconcile?(): Promise<number>;
  log(event: string): void;
};

export type ImportWorkerSummary = {
  processed: number;
  completed: number;
  retried: number;
  lost: number;
};

function errorCode(error: unknown): unknown {
  return (error ?? {}) as { code?: unknown; message?: unknown };
}

function isLeaseLoss(error: unknown): boolean {
  const { code, message } = errorCode(error) as { code?: unknown; message?: unknown };
  return (
    code === 'LEASE_LOST' ||
    code === '55000' ||
    message === 'STALE_IMPORT_LEASE' ||
    message === 'STALE_EVENT_JOB_LEASE'
  );
}

/** Deterministic failures that will never succeed on retry. */
function terminalFailureCode(error: unknown): string | null {
  const { code, message } = errorCode(error) as { code?: unknown; message?: unknown };
  if (message === 'IMPORT_ARTIFACT_DECRYPT_FAILED') return 'IMPORT_ARTIFACT_UNREADABLE';
  if (code === 'VALIDATION_FAILED') return 'IMPORT_BATCH_REJECTED';
  return null;
}

function toBatchRow(deps: ImportWorkerDeps, companyId: string, row: ImportRow): ImportBatchRow {
  if (row.outcome === 'valid') {
    return {
      row_number: row.rowNumber,
      outcome: 'valid',
      employee: deps.sealEmployee(companyId, row.value),
    };
  }
  // Existing-passport duplicates are decided by the database, not pre-flagged here.
  if (row.outcome === 'duplicate_existing') throw new Error('IMPORT_ROW_UNEXPECTED');
  if (row.outcome === 'duplicate_in_file') {
    return {
      row_number: row.rowNumber,
      outcome: 'duplicate_in_file',
      error_code: 'DUPLICATE_IN_FILE',
    };
  }
  return { row_number: row.rowNumber, outcome: 'invalid', error_code: row.errorCode };
}

function rowsOf(bytes: Uint8Array) {
  const result = validateEmployeeImportBytes(bytes);
  return result.ok ? result.rows : null;
}

async function processClaim(deps: ImportWorkerDeps, claim: ImportClaim): Promise<'completed'> {
  const execution = await deps.readExecution(claim);
  if (execution.status !== 'importing') {
    await deps.complete(claim);
    return 'completed';
  }
  if (execution.cancelRequested) {
    await deps.finalize(claim, null);
    await deps.complete(claim);
    return 'completed';
  }
  let sealed: Uint8Array;
  try {
    sealed = await deps.downloadArtifact(execution.storagePath);
  } catch (error) {
    // A missing object is permanent (retention or orphan cleanup); other
    // storage errors stay retryable through the P3.10 lease.
    if ((error as Error | null)?.message !== 'IMPORT_ARTIFACT_MISSING') throw error;
    await deps.finalize(claim, 'IMPORT_ARTIFACT_MISSING');
    await deps.complete(claim);
    return 'completed';
  }
  let plain: Uint8Array;
  try {
    plain = deps.decryptArtifact(sealed);
  } catch (error) {
    if ((error as Error | null)?.message !== 'IMPORT_ARTIFACT_DECRYPT_FAILED') throw error;
    await deps.finalize(claim, 'IMPORT_ARTIFACT_UNREADABLE');
    await deps.complete(claim);
    return 'completed';
  }
  if (sha256Hex(plain) !== execution.artifactSha256) {
    await deps.finalize(claim, 'IMPORT_ARTIFACT_MISMATCH');
    await deps.complete(claim);
    return 'completed';
  }
  await deps.recordAccess(claim, execution.artifactSha256);
  const rows = rowsOf(plain);
  if (!rows || rows.length !== execution.totalRows) {
    await deps.finalize(claim, 'IMPORT_ARTIFACT_INVALID');
    await deps.complete(claim);
    return 'completed';
  }

  let batchNo = execution.nextBatch;
  let firstIndex = execution.nextRow;
  let stopped = false;
  while (!stopped && firstIndex < rows.length) {
    const slice = rows.slice(firstIndex, firstIndex + IMPORT_BATCH_SIZE);
    const result = await deps.applyBatch(
      claim,
      batchNo,
      firstIndex + 1,
      slice.map((row) => toBatchRow(deps, execution.companyId, row)),
    );
    if (result.state === 'cancel_requested' || result.state === 'failed') {
      stopped = true;
      break;
    }
    batchNo += 1;
    firstIndex += slice.length;
  }
  await deps.finalize(claim, null);
  await deps.complete(claim);
  return 'completed';
}

export async function runEmployeeImportWorkerOnce(
  deps: ImportWorkerDeps,
): Promise<ImportWorkerSummary> {
  const summary: ImportWorkerSummary = { processed: 0, completed: 0, retried: 0, lost: 0 };
  if (deps.reconcile) {
    try {
      await deps.reconcile();
    } catch {
      deps.log('employee-import.reconcile-failed');
    }
  }
  for (const claim of await deps.claim()) {
    summary.processed += 1;
    try {
      await processClaim(deps, claim);
      summary.completed += 1;
    } catch (error) {
      if (isLeaseLoss(error)) {
        // Another worker owns the job now; failing it with a stale token would also fail.
        deps.log('employee-import.lease-lost');
        summary.lost += 1;
        continue;
      }
      const terminal =
        terminalFailureCode(error) ??
        (claim.attempt >= claim.maxAttempts ? 'IMPORT_ATTEMPTS_EXHAUSTED' : null);
      if (terminal) {
        try {
          await deps.finalize(claim, terminal);
          await deps.complete(claim);
          deps.log('employee-import.terminal-failure');
          summary.completed += 1;
          continue;
        } catch (finalizeError) {
          if (isLeaseLoss(finalizeError)) {
            deps.log('employee-import.lease-lost');
            summary.lost += 1;
            continue;
          }
          deps.log('employee-import.finalize-failed');
        }
      }
      deps.log('employee-import.retryable-failure');
      summary.retried += 1;
      try {
        await deps.fail(claim, true);
      } catch {
        deps.log('employee-import.fail-report-failed');
      }
    }
  }
  return summary;
}
