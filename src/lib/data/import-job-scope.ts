type EqQuery = {
  eq(column: string, value: unknown): EqQuery;
};

/** Applies the complete ownership and concurrency scope to an import-job mutation. */
export function scopeImportJobMutation<T extends EqQuery>(
  query: T,
  tenantId: string,
  jobId: string,
  expectedStatus: string,
): T {
  return query.eq('tenant_id', tenantId).eq('id', jobId).eq('status', expectedStatus) as T;
}

export class ImportJobTransitionConflict extends Error {
  readonly code = 'IMPORT_JOB_STATE_CHANGED';

  constructor() {
    super('Import job state changed');
    this.name = 'ImportJobTransitionConflict';
  }
}

export function assertImportJobTransitionMatched(row: { id: string } | null): void {
  if (!row) throw new ImportJobTransitionConflict();
}

export function shouldCompensateImportFailure(error: unknown): boolean {
  return !(error instanceof ImportJobTransitionConflict);
}

export function isImportJobCancellable(status: string): boolean {
  return status === 'uploaded' || status === 'validating' || status === 'validated';
}
