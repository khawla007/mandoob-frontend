const IMPORT_JOB_STATUSES = new Set([
  'uploaded',
  'validating',
  'validated',
  'importing',
  'completed',
  'failed',
  'cancelled',
] as const);

const IMPORT_ERROR_CODES = new Set([
  'VALIDATION_FAILED',
  'DUPLICATE_SKIPPED',
  'INSERT_FAILED',
  'CANCELLED',
] as const);

const IMPORT_FIELDS = new Set([
  'name',
  'email',
  'phone',
  'nationality',
  'passport_no',
  'visa_no',
  'visa_expiry',
  'emirates_id',
  'eid_expiry',
  'row',
  'job',
] as const);

export function safeImportJobStatus(value: unknown) {
  return typeof value === 'string' && IMPORT_JOB_STATUSES.has(value as never) ? value : 'unknown';
}

export function safeImportErrorCode(value: unknown) {
  return typeof value === 'string' && IMPORT_ERROR_CODES.has(value as never) ? value : 'UNKNOWN';
}

export function safeImportField(value: unknown) {
  return typeof value === 'string' && IMPORT_FIELDS.has(value as never) ? value : 'unknown';
}
