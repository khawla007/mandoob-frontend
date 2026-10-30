import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../errors';
import {
  buildDocumentUploadPath,
  validateDocumentUpload,
  type DocumentUploadInput,
  type ValidatedDocumentUpload,
} from '../storage/document-upload-validation';

export type DocumentUploadScope = {
  tenantId: string;
  companyId: string;
  operationId: string;
};
export type CoordinateDocumentUploadInput = DocumentUploadScope & {
  actorId: string;
  requestId: string | null;
  documentId: string | null;
  employeeId: string | null;
  docType: string;
  label: string | null;
  expectedHead: string | null;
  file: DocumentUploadInput;
};
export type DocumentUploadReceipt = {
  status: 'finalized';
  operationId: string;
  documentId: string;
  versionId: string;
};
export type DocumentUploadRecoveryResult =
  | DocumentUploadReceipt
  | {
      status: 'prepared' | 'cleanup_pending' | 'cleaned';
      operationId: string;
    };

/** Service-only boundaries. RPC/scanner/provider results remain runtime-untrusted. */
export type DocumentUploadDependencies = {
  now: () => number;
  timeoutMs?: number;
  rpc: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
  scan: (data: Uint8Array, signal: AbortSignal) => Promise<unknown>;
  storage: {
    // 'rejected' means this adapter definitively knows no writer was started.
    // Generic errors/abort/network failures must throw, never return 'rejected'.
    create: (
      bucket: string,
      path: string,
      data: Uint8Array,
      mimeType: string,
      signal: AbortSignal,
    ) => Promise<'created' | 'already_exists' | 'rejected'>;
    download: (
      bucket: string,
      path: string,
      signal: AbortSignal,
    ) => Promise<{
      stream: ReadableStream<Uint8Array>;
      mimeType: string;
      sizeBytes: number;
    }>;
    remove: (bucket: string, paths: string[], signal: AbortSignal) => Promise<void>;
  };
};

type Identity = DocumentUploadScope & {
  objectId: string;
  extension: string;
  documentId: string;
  versionId: string;
  storageBucket: 'tenant-documents';
  storagePath: string;
  deadlineAt: string;
};
type Reservation = Identity & { status: 'prepared' | 'cleanup_pending' };
type CleanupPermit = Identity & {
  status: 'cleanup_pending' | 'delete_authorized';
  fence: string;
  leaseUntil: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;
const DOC_TYPES = new Set([
  'passport',
  'visa',
  'emirates_id',
  'trade_license',
  'ejari',
  'moa',
  'shareholder_id',
  'other',
  'aoa',
  'bank_reference_letter',
  'noc',
  'cv_resume',
  'office_lease',
  'medical_certificate',
  'insurance_policy',
]);
const IDENTITY_KEYS = [
  'tenantId',
  'companyId',
  'operationId',
  'objectId',
  'extension',
  'documentId',
  'versionId',
  'storageBucket',
  'storagePath',
  'deadlineAt',
];
const STATE_KEYS = ['status', 'operationId'];
const RECEIPT_KEYS = [
  'status',
  'operationId',
  'documentId',
  'versionId',
  'requestId',
  'finalizedAt',
];
const TTL_MS = 900_000;
const LEASE_MS = 300_000;

function failure(code = 'DOCUMENT_UPLOAD_FAILED', status = 503): ApiError {
  return new ApiError(code, 'Document upload could not be completed', status);
}
function invalid(): never {
  throw failure('VALIDATION_FAILED', 400);
}
function protocol(): never {
  throw failure('DOCUMENT_UPLOAD_PROTOCOL_INVALID');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) protocol();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    protocol();
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 36 || !UUID.test(value)) invalid();
  return value.toLowerCase();
}
function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value)))
    protocol();
  return Date.parse(value);
}
function clock(deps: DocumentUploadDependencies): number {
  const value = deps.now();
  if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) invalid();
  return value;
}
function normalizeScope(value: unknown): DocumentUploadScope {
  const r = record(value);
  return {
    tenantId: uuid(r.tenantId),
    companyId: uuid(r.companyId),
    operationId: uuid(r.operationId),
  };
}
function normalizeInput(value: CoordinateDocumentUploadInput): CoordinateDocumentUploadInput {
  const r = record(value);
  const optional = (key: string) => (r[key] === null ? null : uuid(r[key]));
  if (
    typeof r.docType !== 'string' ||
    !DOC_TYPES.has(r.docType) ||
    (r.label !== null &&
      (typeof r.label !== 'string' || r.label.length > 200 || /\p{Cc}/u.test(r.label)))
  )
    invalid();
  return {
    ...normalizeScope(value),
    actorId: uuid(r.actorId),
    requestId: optional('requestId'),
    documentId: optional('documentId'),
    employeeId: optional('employeeId'),
    expectedHead: optional('expectedHead'),
    docType: r.docType,
    label: r.label as string | null,
    file: r.file as DocumentUploadInput,
  };
}

class BoundaryTimeout extends Error {}
/** Aborting limits client resource use; it does NOT establish provider quiescence. */
async function bounded<T>(
  deps: DocumentUploadDependencies,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const milliseconds = deps.timeoutMs ?? 15_000;
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > 30_000) invalid();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => task(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new BoundaryTimeout());
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
function scopeArgs(scope: DocumentUploadScope): Record<string, unknown> {
  return {
    p_tenant_id: scope.tenantId,
    p_company_id: scope.companyId,
    p_operation_id: scope.operationId,
  };
}
function rpc(
  deps: DocumentUploadDependencies,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return bounded(deps, (signal) => deps.rpc(name, args, signal));
}
function sqlCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^DU\d{3}$/u.test(code) ? code : undefined;
}
function sanitized(error: unknown): ApiError {
  // Even an injected boundary can throw an ApiError containing private details.
  // Preserve only recognized classifications, never its message/details/status.
  if (error instanceof ApiError) {
    const statuses: Record<string, number> = {
      VALIDATION_FAILED: 400,
      PAYLOAD_EMPTY: 400,
      PAYLOAD_TOO_LARGE: 413,
      UNSUPPORTED_MEDIA_TYPE: 415,
      CHECKSUM_MISMATCH: 422,
      MALWARE_DETECTED: 422,
      SCANNER_UNAVAILABLE: 503,
      DOCUMENT_UPLOAD_FAILED: 503,
      DOCUMENT_UPLOAD_PROTOCOL_INVALID: 503,
      DOCUMENT_UPLOAD_EXPIRED: 410,
      FORBIDDEN: 403,
      CONFLICT: 409,
    };
    if (Object.hasOwn(statuses, error.code)) return failure(error.code, statuses[error.code]);
    return failure();
  }
  const code = sqlCode(error);
  if (code === 'DU403') return failure('FORBIDDEN', 403);
  if (code === 'DU409') return failure('CONFLICT', 409);
  if (code === 'DU410') return failure('DOCUMENT_UPLOAD_EXPIRED', 410);
  if (code === 'DU422') return failure('VALIDATION_FAILED', 400);
  return failure();
}

function readReceipt(
  value: unknown,
  scope: DocumentUploadScope,
  deps: DocumentUploadDependencies,
  expected?: Partial<Identity> & { requestId?: string | null },
): DocumentUploadReceipt {
  const r = record(value);
  exact(r, RECEIPT_KEYS);
  if (
    r.status !== 'finalized' ||
    uuid(r.operationId) !== scope.operationId ||
    timestamp(r.finalizedAt) > clock(deps)
  )
    protocol();
  const receipt: DocumentUploadReceipt = {
    status: 'finalized',
    operationId: uuid(r.operationId),
    documentId: uuid(r.documentId),
    versionId: uuid(r.versionId),
  };
  const requestId = r.requestId === null ? null : uuid(r.requestId);
  if (
    (expected?.documentId && receipt.documentId !== expected.documentId) ||
    (expected?.versionId && receipt.versionId !== expected.versionId) ||
    (expected && Object.hasOwn(expected, 'requestId') && requestId !== expected.requestId)
  )
    protocol();
  return receipt;
}
function readState(
  value: unknown,
  scope: DocumentUploadScope,
  statuses: readonly string[],
): Record<string, unknown> {
  const r = record(value);
  if (!statuses.includes(r.status as string) || uuid(r.operationId) !== scope.operationId)
    protocol();
  return r;
}
function readIdentity(
  r: Record<string, unknown>,
  scope: DocumentUploadScope,
  deps: DocumentUploadDependencies,
): Identity {
  const identity: Identity = {
    tenantId: uuid(r.tenantId),
    companyId: uuid(r.companyId),
    operationId: uuid(r.operationId),
    objectId: uuid(r.objectId),
    documentId: uuid(r.documentId),
    versionId: uuid(r.versionId),
    extension: r.extension as string,
    storageBucket: 'tenant-documents',
    storagePath: r.storagePath as string,
    deadlineAt: new Date(timestamp(r.deadlineAt)).toISOString(),
  };
  if (
    identity.tenantId !== scope.tenantId ||
    identity.companyId !== scope.companyId ||
    identity.operationId !== scope.operationId ||
    r.storageBucket !== 'tenant-documents' ||
    timestamp(r.deadlineAt) > clock(deps) + TTL_MS ||
    r.storagePath !== buildDocumentUploadPath(identity)
  )
    protocol();
  return identity;
}
function sameIdentity(actual: Identity, expected: Identity): void {
  if (
    IDENTITY_KEYS.some((key) => actual[key as keyof Identity] !== expected[key as keyof Identity])
  )
    protocol();
}
function readReservation(
  value: unknown,
  scope: DocumentUploadScope,
  deps: DocumentUploadDependencies,
): Reservation {
  const r = readState(value, scope, ['prepared', 'cleanup_pending']);
  exact(r, ['status', ...IDENTITY_KEYS]);
  return { ...readIdentity(r, scope, deps), status: r.status as Reservation['status'] };
}
function readPermit(
  value: unknown,
  scope: DocumentUploadScope,
  deps: DocumentUploadDependencies,
  status: CleanupPermit['status'],
  expected: Identity,
): CleanupPermit {
  const r = readState(value, scope, [status]);
  exact(r, ['status', ...IDENTITY_KEYS, 'fence', 'leaseUntil']);
  const identity = readIdentity(r, scope, deps);
  sameIdentity(identity, expected);
  const lease = timestamp(r.leaseUntil);
  const time = clock(deps);
  if (lease <= time || lease > time + LEASE_MS) protocol();
  return { ...identity, status, fence: uuid(r.fence), leaseUntil: new Date(lease).toISOString() };
}
async function actorReceipt(
  input: CoordinateDocumentUploadInput,
  identity: Identity,
  deps: DocumentUploadDependencies,
): Promise<DocumentUploadReceipt | { status: string }> {
  const result = await rpc(deps, 'get_document_upload_receipt', {
    ...scopeArgs(input),
    p_actor_id: input.actorId,
  });
  if (record(result).status === 'finalized')
    return readReceipt(result, input, deps, { ...identity, requestId: input.requestId });
  const r = readState(result, input, ['prepared', 'cleanup_pending', 'cleaned']);
  exact(r, STATE_KEYS);
  return { status: r.status as string };
}

/** Reads actual bytes with a strict stream ceiling; never buffers an unbounded Blob. */
async function verifyStored(
  identity: Identity,
  file: ValidatedDocumentUpload,
  deps: DocumentUploadDependencies,
): Promise<void> {
  await bounded(deps, async (signal) => {
    const result = await deps.storage.download(
      identity.storageBucket,
      identity.storagePath,
      signal,
    );
    if (!result || typeof result !== 'object' || !(result.stream instanceof ReadableStream))
      protocol();
    const reader = result.stream.getReader();
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      // A provider may ignore abort and deliver the stream after the timeout.
      // The abort event already happened; never start a read on that late stream.
      if (signal.aborted) throw new BoundaryTimeout();
      if (result.mimeType !== file.mimeType || result.sizeBytes !== file.sizeBytes) protocol();
      let size = 0;
      let chunks = 0;
      const hash = createHash('sha256');
      while (true) {
        const { done, value } = await reader.read();
        if (signal.aborted) throw new BoundaryTimeout();
        if (done) break;
        if (
          !(value instanceof Uint8Array) ||
          value.byteLength === 0 ||
          value.byteLength > file.sizeBytes - size
        )
          protocol();
        size += value.byteLength;
        hash.update(value);
        // Immediately readable tiny chunks otherwise monopolize microtasks and
        // prevent the boundary's real abort timer from ever running.
        if (++chunks % 64 === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
          if (signal.aborted) throw new BoundaryTimeout();
        }
      }
      // Also observe a deadline reached during the final partial chunk batch.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (signal.aborted) throw new BoundaryTimeout();
      if (size !== file.sizeBytes || hash.digest('hex') !== file.sha256) protocol();
    } finally {
      signal.removeEventListener('abort', cancel);
      cancel();
      // cancel() is deliberately not awaited: a provider can hang during cancel too.
    }
  });
}

async function reconcile(
  scope: DocumentUploadScope,
  deps: DocumentUploadDependencies,
): Promise<DocumentUploadRecoveryResult | Reservation> {
  const value = await rpc(deps, 'reconcile_document_upload_cleanup', scopeArgs(scope));
  if (record(value).status === 'finalized') return readReceipt(value, scope, deps);
  if (record(value).status === 'cleaned') {
    const r = readState(value, scope, ['cleaned']);
    exact(r, STATE_KEYS);
    return { status: 'cleaned', operationId: scope.operationId };
  }
  return readReservation(value, scope, deps);
}

async function cleanup(
  scope: DocumentUploadScope,
  deps: DocumentUploadDependencies,
): Promise<DocumentUploadRecoveryResult> {
  const pending: DocumentUploadRecoveryResult = {
    status: 'cleanup_pending',
    operationId: scope.operationId,
  };
  try {
    const state = await reconcile(scope, deps);
    if (state.status === 'finalized' || state.status === 'cleaned') return state;
    const identity = state as Reservation;
    // Neither this request nor generic recovery can establish cross-request
    // physical writer quiescence for a live same-operation reservation.
    if (identity.status === 'prepared' && timestamp(identity.deadlineAt) > clock(deps)) {
      return { status: 'prepared', operationId: scope.operationId };
    }
    const args = scopeArgs(scope);
    const claim = readPermit(
      await rpc(deps, 'claim_document_upload_cleanup', { ...args, p_lease_seconds: 300 }),
      scope,
      deps,
      'cleanup_pending',
      identity,
    );
    const authorization = readPermit(
      await rpc(deps, 'authorize_document_upload_cleanup', { ...args, p_fence: claim.fence }),
      scope,
      deps,
      'delete_authorized',
      identity,
    );
    if (
      authorization.fence !== claim.fence ||
      authorization.leaseUntil !== claim.leaseUntil ||
      timestamp(authorization.leaseUntil) <= clock(deps)
    )
      protocol();
    let deleted = false;
    try {
      await bounded(deps, (signal) =>
        deps.storage.remove(authorization.storageBucket, [authorization.storagePath], signal),
      );
      deleted = true;
    } catch {
      /* A failed/ambiguous remove must not acknowledge deletion. */
    }
    if (timestamp(authorization.leaseUntil) <= clock(deps)) throw failure();
    const completion = await rpc(deps, 'complete_document_upload_cleanup', {
      ...args,
      p_fence: authorization.fence,
      p_deleted: deleted,
    });
    const r = readState(completion, scope, deleted ? ['cleaned'] : ['cleanup_pending']);
    exact(r, STATE_KEYS);
    return { status: r.status as 'cleaned' | 'cleanup_pending', operationId: scope.operationId };
  } catch {
    // Never repeat a delete with a stale/expired fence. A lost completion can be
    // resolved privately forever, without returning private success to an actor.
    try {
      const state = await reconcile(scope, deps);
      if (state.status === 'finalized' || state.status === 'cleaned') return state;
      return { status: state.status, operationId: scope.operationId };
    } catch {
      return pending;
    }
  }
}

/** Trusted server IDs; fresh actor/resource authority is checked by every actor RPC. */
export async function coordinateDocumentUpload(
  rawInput: CoordinateDocumentUploadInput,
  deps: DocumentUploadDependencies = createDocumentUploadDependencies(),
): Promise<DocumentUploadReceipt> {
  let input: CoordinateDocumentUploadInput;
  let file: ValidatedDocumentUpload;
  try {
    input = normalizeInput(rawInput);
    file = await validateDocumentUpload(input.file);
    clock(deps);
  } catch (error) {
    throw sanitized(error);
  }
  const args = {
    ...scopeArgs(input),
    p_actor_id: input.actorId,
    p_request_id: input.requestId,
    p_document_id: input.documentId,
    p_employee_id: input.employeeId,
    p_doc_type: input.docType,
    p_label: input.label,
    p_expected_head: input.expectedHead,
    p_sha256: file.sha256,
    p_mime_type: file.mimeType,
    p_size_bytes: file.sizeBytes,
    p_extension: file.extension,
    p_safe_filename: file.filename,
  };
  let prepared: unknown;
  try {
    try {
      prepared = await rpc(deps, 'prepare_document_upload', args);
    } catch (error) {
      if (sqlCode(error)) throw error;
      // Ambiguous preparation establishes ownership only by exact actor/payload replay.
      prepared = await rpc(deps, 'prepare_document_upload', args);
    }
  } catch (error) {
    throw sanitized(error);
  }
  let identity: Reservation;
  try {
    if (record(prepared).status === 'finalized')
      return readReceipt(prepared, input, deps, {
        documentId: input.documentId ?? undefined,
        requestId: input.requestId,
      });
    identity = readReservation(prepared, input, deps);
    if (
      identity.status !== 'prepared' ||
      identity.extension !== file.extension ||
      timestamp(identity.deadlineAt) <= clock(deps) ||
      (input.documentId && identity.documentId !== input.documentId)
    )
      protocol();
  } catch (error) {
    throw sanitized(error);
  } // malformed preparation never licenses cleanup

  try {
    const beforeScan = await actorReceipt(input, identity, deps);
    if (beforeScan.status === 'finalized') return beforeScan as DocumentUploadReceipt;
    if (beforeScan.status !== 'prepared') throw failure('CONFLICT', 409);
    const scan = record(
      await bounded(deps, (signal) => deps.scan(new Uint8Array(file.data), signal)),
    );
    if (
      Object.keys(scan).some((key) => !['clean', 'provider', 'reason'].includes(key)) ||
      scan.clean !== true ||
      scan.provider !== 'clamav' ||
      scan.reason !== undefined
    ) {
      if (
        scan.clean === false &&
        ['malware_detected', 'eicar_test'].includes(scan.reason as string)
      )
        throw failure('MALWARE_DETECTED', 422);
      throw failure('SCANNER_UNAVAILABLE');
    }
    const scanCompletedAt = new Date(clock(deps)).toISOString();
    if (timestamp(identity.deadlineAt) <= clock(deps))
      throw failure('DOCUMENT_UPLOAD_EXPIRED', 410);
    const created = await bounded(deps, (signal) =>
      deps.storage.create(
        identity.storageBucket,
        identity.storagePath,
        new Uint8Array(file.data),
        file.mimeType,
        signal,
      ),
    );
    if (!['created', 'already_exists', 'rejected'].includes(created)) protocol();
    if (created === 'rejected') throw failure();
    await verifyStored(identity, file, deps);
    const beforeFinalize = await actorReceipt(input, identity, deps);
    if (beforeFinalize.status === 'finalized') return beforeFinalize as DocumentUploadReceipt;
    if (beforeFinalize.status !== 'prepared') throw failure('CONFLICT', 409);
    // Once finalize is dispatched it may commit, including after an RPC timeout.
    const result = await rpc(deps, 'finalize_document_upload', {
      ...scopeArgs(input),
      p_actor_id: input.actorId,
      p_scan_state: 'clean',
      p_scan_provider: 'clamav',
      p_scan_completed_at: scanCompletedAt,
      p_storage_path: identity.storagePath,
      p_mime_type: file.mimeType,
      p_size_bytes: file.sizeBytes,
      p_sha256: file.sha256,
    });
    return readReceipt(result, input, deps, { ...identity, requestId: input.requestId });
  } catch (error) {
    try {
      const state = await actorReceipt(input, identity, deps);
      if (state.status === 'finalized') return state as DocumentUploadReceipt;
      // Even a scan failure before OUR create may race another same-operation
      // writer. Leave compensation to explicit expired scoped recovery; neither
      // this receipt snapshot nor client abort proves physical quiescence.
    } catch {
      /* Unknown or revoked actor authority: leave operation/object intact. */
    }
    throw sanitized(error);
  }
}

/** Private scoped recovery. Never grants uploader authority or deletes compliance history. */
export async function recoverDocumentUploadCleanup(
  rawScope: DocumentUploadScope,
  deps: DocumentUploadDependencies = createDocumentUploadDependencies(),
): Promise<DocumentUploadRecoveryResult> {
  const scope = normalizeScope(rawScope);
  clock(deps);
  return cleanup(scope, deps);
}

/** One bounded snapshot, not a scheduler/queue or an unbounded compliance sweep. */
export async function recoverExpiredDocumentUploads(
  input: { tenantId: string; companyId: string; limit: number },
  deps: DocumentUploadDependencies = createDocumentUploadDependencies(),
): Promise<DocumentUploadRecoveryResult[]> {
  const r = record(input);
  const tenantId = uuid(r.tenantId);
  const companyId = uuid(r.companyId);
  if (!Number.isInteger(r.limit) || (r.limit as number) < 1 || (r.limit as number) > 25) invalid();
  const limit = r.limit as number;
  const time = clock(deps);
  let reservations: Reservation[];
  try {
    const result = record(
      await rpc(deps, 'list_document_upload_cleanup_candidates', {
        p_tenant_id: tenantId,
        p_company_id: companyId,
        p_limit: limit,
      }),
    );
    exact(result, ['status', 'operations']);
    if (
      result.status !== 'candidates' ||
      !Array.isArray(result.operations) ||
      result.operations.length > limit
    )
      protocol();
    const ids = new Set<string>();
    reservations = result.operations.map((value) => {
      const operationId = uuid(record(value).operationId);
      const candidate = readReservation(value, { tenantId, companyId, operationId }, deps);
      // SQL may discover an expired cleanup lease before the original upload
      // deadline; only prepared candidates require an expired write deadline.
      if (
        ids.has(operationId) ||
        (candidate.status === 'prepared' && timestamp(candidate.deadlineAt) > time)
      )
        protocol();
      ids.add(operationId);
      return candidate;
    });
  } catch (error) {
    throw sanitized(error);
  }
  const results: DocumentUploadRecoveryResult[] = [];
  for (const reservation of reservations) results.push(await cleanup(reservation, deps));
  return results;
}

/** Storage 1.11.2 requires only name, despite the SDK's wider FileObject type.
 * An empty array acknowledges an already-absent object, NOT physical quiescence:
 * SQL completion must still independently verify storage.objects absence.
 */
function validateRemovalAcknowledgement(value: unknown, bucket: string, paths: string[]): void {
  const result = record(value);
  exact(result, ['data', 'error']);
  if (
    result.error !== null ||
    !Array.isArray(result.data) ||
    paths.length !== 1 ||
    result.data.length > 1
  )
    protocol();
  const fields = new Set([
    'name',
    'bucket_id',
    'owner',
    'owner_id',
    'version',
    'id',
    'updated_at',
    'created_at',
    'last_accessed_at',
    'metadata',
    'user_metadata',
    'buckets',
  ]);
  for (const value of result.data) {
    const object = record(value);
    if (
      object.name !== paths[0] ||
      Object.keys(object).some((key) => !fields.has(key)) ||
      (Object.hasOwn(object, 'bucket_id') && object.bucket_id !== bucket)
    )
      protocol();
    if (Object.hasOwn(object, 'id') && object.id !== null) uuid(object.id);
    for (const key of ['owner', 'owner_id', 'version']) {
      if (Object.hasOwn(object, key) && object[key] !== null && typeof object[key] !== 'string')
        protocol();
    }
    for (const key of ['updated_at', 'created_at', 'last_accessed_at']) {
      if (Object.hasOwn(object, key) && object[key] !== null) timestamp(object[key]);
    }
    for (const key of ['metadata', 'user_metadata']) {
      if (Object.hasOwn(object, key) && object[key] !== null) record(object[key]);
    }
    if (Object.hasOwn(object, 'buckets')) {
      const detail = record(object.buckets);
      for (const key of ['id', 'name']) {
        if (Object.hasOwn(detail, key) && detail[key] !== bucket) protocol();
      }
    }
  }
}

/** Lazy imports keep pure injected coordinator tests independent of credentials. */
export function createDocumentUploadDependencies(options?: {
  client?: (signal: AbortSignal) => Promise<SupabaseClient>;
}): DocumentUploadDependencies {
  const injectedClient = options?.client;
  async function client(signal: AbortSignal) {
    if (injectedClient) return injectedClient(signal);
    const { createSupabaseServiceRoleClient } = await import('../supabase/service-role');
    return createSupabaseServiceRoleClient({ signal });
  }
  return {
    now: Date.now,
    rpc: async (name, args, signal) => {
      const result = await (await client(signal)).rpc(name, args);
      if (result.error) throw { code: result.error.code };
      return result.data;
    },
    scan: async (data) => {
      const { scanFilePrivate } = await import('../security/scan-file');
      return scanFilePrivate(data, { timeoutMs: 15_000 });
    },
    storage: {
      create: async (bucket, path, data, mimeType, signal) => {
        const result = await (await client(signal)).storage
          .from(bucket)
          .upload(path, data, { contentType: mimeType, upsert: false });
        if (result.error) {
          const error = result.error as { statusCode?: string; error?: string };
          if (error.statusCode === '409' || error.error === 'Duplicate') return 'already_exists';
          throw failure(); // Do not mistake a network rejection for no provider write.
        }
        if (!result.data || result.data.path !== path) protocol();
        return 'created';
      },
      download: async (bucket, path, signal) => {
        const storage = (await client(signal)).storage.from(bucket);
        const info = await storage.info(path);
        if (
          info.error ||
          !info.data ||
          typeof info.data.contentType !== 'string' ||
          !Number.isInteger(info.data.size)
        )
          throw failure();
        const result = await storage.download(path, {}, { signal }).asStream();
        if (result.error || !result.data) throw failure();
        return { stream: result.data, mimeType: info.data.contentType, sizeBytes: info.data.size! };
      },
      remove: async (bucket, paths, signal) => {
        const result = await (await client(signal)).storage.from(bucket).remove(paths);
        validateRemovalAcknowledgement(result, bucket, paths);
      },
    },
  };
}
