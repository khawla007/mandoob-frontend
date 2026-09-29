import { createHash } from 'node:crypto';

/** Canonical JSON: sorted object keys, `undefined` members dropped. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Operation payload hash: identical intent replays, changed intent conflicts. */
export function payloadHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export type P308ErrorCode =
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'OPERATION_REUSED'
  | 'STALE_VERSION'
  | 'EMPLOYEE_PASSPORT_DUPLICATE'
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_STATUS_UNCHANGED'
  | 'EMPLOYEE_STATUS_TERMINAL'
  | 'IMPORT_NOT_FOUND'
  | 'IMPORT_DUPLICATE_ARTIFACT'
  | 'INVALID_IMPORT_TRANSITION'
  | 'RENEWAL_NOT_FOUND'
  | 'RENEWAL_DUPLICATE'
  | 'RENEWAL_TERMINAL'
  | 'RENEWAL_BLOCKED'
  | 'RENEWAL_LICENSE_LOCKED'
  | 'RENEWAL_EVIDENCE_REQUIRED'
  | 'RENEWAL_EVIDENCE_NOT_FOUND'
  | 'INVALID_RENEWAL_TRANSITION'
  | 'INTERNAL';

export type P308Failure = { code: P308ErrorCode; status: number };

const DOMAIN: Record<string, P308Failure> = {
  OPERATION_REUSED: { code: 'OPERATION_REUSED', status: 409 },
  STALE_VERSION: { code: 'STALE_VERSION', status: 409 },
  EMPLOYEE_PASSPORT_DUPLICATE: { code: 'EMPLOYEE_PASSPORT_DUPLICATE', status: 409 },
  EMPLOYEE_NOT_FOUND: { code: 'EMPLOYEE_NOT_FOUND', status: 404 },
  EMPLOYEE_STATUS_UNCHANGED: { code: 'EMPLOYEE_STATUS_UNCHANGED', status: 409 },
  EMPLOYEE_STATUS_TERMINAL: { code: 'EMPLOYEE_STATUS_TERMINAL', status: 409 },
  IMPORT_NOT_FOUND: { code: 'IMPORT_NOT_FOUND', status: 404 },
  IMPORT_DUPLICATE_ARTIFACT: { code: 'IMPORT_DUPLICATE_ARTIFACT', status: 409 },
  INVALID_IMPORT_TRANSITION: { code: 'INVALID_IMPORT_TRANSITION', status: 409 },
  RENEWAL_NOT_FOUND: { code: 'RENEWAL_NOT_FOUND', status: 404 },
  RENEWAL_DUPLICATE: { code: 'RENEWAL_DUPLICATE', status: 409 },
  RENEWAL_TERMINAL: { code: 'RENEWAL_TERMINAL', status: 409 },
  RENEWAL_BLOCKED: { code: 'RENEWAL_BLOCKED', status: 409 },
  RENEWAL_LICENSE_LOCKED: { code: 'RENEWAL_LICENSE_LOCKED', status: 409 },
  RENEWAL_EVIDENCE_REQUIRED: { code: 'RENEWAL_EVIDENCE_REQUIRED', status: 422 },
  RENEWAL_EVIDENCE_NOT_FOUND: { code: 'RENEWAL_EVIDENCE_NOT_FOUND', status: 422 },
  INVALID_RENEWAL_TRANSITION: { code: 'INVALID_RENEWAL_TRANSITION', status: 409 },
};

/** Maps an RPC error to a stable code; raw database text is never surfaced. */
export function mapP308Error(error: unknown): P308Failure {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (code === '42501') return { code: 'FORBIDDEN', status: 403 };
  if (code === '22023') return { code: 'VALIDATION_FAILED', status: 400 };
  if (code === 'P0001' && typeof message === 'string' && DOMAIN[message]) return DOMAIN[message];
  return { code: 'INTERNAL', status: 500 };
}
