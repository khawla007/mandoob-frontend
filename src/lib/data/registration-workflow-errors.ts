// Maps P3.06 registration/visa RPC failures onto the canonical public error
// shape `{ error, code, details? }` plus an HTTP status. Mirrors the structure
// of company-assignment-errors.ts: message-code first, then PG sqlstate.
//
// The RPCs raise P0001 with a stable message token (the domain code), 42501
// with 'FORBIDDEN', and 22023 for input errors. 23505 (unique_violation) is
// only observed when the RPC re-raises it as a P0001 domain token, but we map
// the raw sqlstate defensively too.

// 404 — the addressed resource does not exist within the caller's scope.
const NOT_FOUND_CODES = [
  'REGISTRATION_NOT_FOUND',
  'STAGE_NOT_FOUND',
  'DOCUMENT_LINK_NOT_FOUND',
  'VISA_PERSON_NOT_FOUND',
  'VISA_SOURCE_NOT_FOUND',
] as const;

// 409 — idempotency, optimistic-concurrency, uniqueness, immutability, and
// terminal-state conflicts. The client can resolve these by re-reading.
const CONFLICT_CODES = [
  'OPERATION_REUSED',
  'STALE_REGISTRATION_VERSION',
  'STALE_STAGE_VERSION',
  'STALE_VISA_VERSION',
  'ACTIVE_REGISTRATION_EXISTS',
  'VISA_PERSON_EXISTS',
  'DOCUMENT_ALREADY_LINKED',
  'REGISTRATION_TERMINAL',
  'STAGE_ALREADY_TERMINAL',
  'VISA_PERSON_TERMINAL',
  'REGISTRATION_NOT_ACTIVE',
  'REGISTRATION_EVENT_IMMUTABLE',
  'REGISTRATION_DOMAIN_EVENT_IMMUTABLE',
  'COMPLETED_STAGE_EVIDENCE_IMMUTABLE',
] as const;

// 422 — the command is well-formed but violates a workflow business rule given
// current state; re-reading will not make the same command valid.
const UNPROCESSABLE_CODES = [
  'INVALID_STAGE_TRANSITION',
  'STAGE_SKIP_FORBIDDEN',
  'STAGE_REQUIREMENTS_INCOMPLETE',
  'ILLEGAL_STAGE_ORDER',
  'REGISTRATION_COMPLETION_BLOCKED',
  'VISA_STAGE_INACTIVE',
  'INVALID_VISA_TRANSITION',
  'ILLEGAL_VISA_STAGE_ORDER',
  'VISA_COMPLETION_BLOCKED',
  'DOCUMENT_VERSION_NOT_APPROVED',
  'DOCUMENT_ROLE_FORBIDDEN',
  'COMPANY_INACTIVE',
] as const;

// 400 — malformed input tokens raised with sqlstate 22023.
const INPUT_CODES = [
  'INVALID_REGISTRATION_INPUT',
  'INVALID_STAGE_COMMAND',
  'INVALID_STAGE_REASON',
  'INVALID_STAGE_DETAILS',
  'INVALID_VISA_PERSON',
  'INVALID_VISA_COMMAND',
  'INVALID_VISA_REASON',
  'INVALID_RECOVERY_REASON',
  'INVALID_OPERATION',
  'INVALID_OPERATION_RESULT',
] as const;

type NotFoundCode = (typeof NOT_FOUND_CODES)[number];
type ConflictCode = (typeof CONFLICT_CODES)[number];
type UnprocessableCode = (typeof UNPROCESSABLE_CODES)[number];
type InputCode = (typeof INPUT_CODES)[number];

export type RegistrationWorkflowDomainCode =
  | NotFoundCode
  | ConflictCode
  | UnprocessableCode
  | InputCode;

export type RegistrationWorkflowPublicError = {
  error: string;
  code: RegistrationWorkflowDomainCode | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL';
  status: 400 | 403 | 404 | 409 | 422 | 500;
  details?: Record<string, unknown>;
};

const notFound = new Set<string>(NOT_FOUND_CODES);
const conflict = new Set<string>(CONFLICT_CODES);
const unprocessable = new Set<string>(UNPROCESSABLE_CODES);
const input = new Set<string>(INPUT_CODES);

export function mapRegistrationWorkflowError(
  error: { message?: unknown; code?: unknown } | null,
): RegistrationWorkflowPublicError {
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  const sqlstate = typeof error?.code === 'string' ? error.code : '';

  // Message-code first: the RPCs raise a stable domain token that is more
  // specific than the sqlstate carrying it.
  if (message === 'FORBIDDEN') {
    return { error: 'Not authorized for this registration action', code: 'FORBIDDEN', status: 403 };
  }
  if (notFound.has(message)) {
    return {
      error: 'Registration resource not found',
      code: message as NotFoundCode,
      status: 404,
    };
  }
  if (conflict.has(message)) {
    return {
      error: 'Registration action conflicts with current state',
      code: message as ConflictCode,
      status: 409,
    };
  }
  if (unprocessable.has(message)) {
    return {
      error: 'Registration action is not allowed in the current state',
      code: message as UnprocessableCode,
      status: 422,
    };
  }
  if (input.has(message)) {
    return { error: 'Invalid registration input', code: message as InputCode, status: 400 };
  }

  // sqlstate fallback for errors surfaced without a domain token.
  if (sqlstate === '42501') {
    return { error: 'Not authorized for this registration action', code: 'FORBIDDEN', status: 403 };
  }
  if (sqlstate === '23505') {
    return {
      error: 'Registration action conflicts with current state',
      code: 'CONFLICT',
      status: 409,
    };
  }
  if (sqlstate === '22023') {
    // Unknown 22023 token: still a client input fault.
    return { error: 'Invalid registration input', code: 'INTERNAL', status: 400 };
  }

  return { error: 'Unable to complete registration action', code: 'INTERNAL', status: 500 };
}
