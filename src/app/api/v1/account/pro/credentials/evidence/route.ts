import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { SessionProfile } from '@/lib/auth/require-user';
import { ApiError, errorResponse, jsonOk } from '@/lib/errors';
import {
  PRO_CREDENTIAL_EVIDENCE_MAX_BYTES,
  proCredentialEvidenceMetadataSchema,
} from '@/lib/validation/pro-lifecycle';
import {
  BodyTooLargeError,
  MULTIPART_BODY_ENVELOPE_BYTES,
  readBoundedFormData,
} from '@/app/api/v1/_shared/bounded-body';
import { buildProCredentialEvidencePath } from '@/lib/storage/pro-credential-path';
import { PRO_CREDENTIAL_STATES } from '@/lib/pro-lifecycle/contracts';
import {
  lifecycleErrorResponse,
  limitResponse,
  notFoundResponse,
  requireAal2Response,
  requireLiveProAccount,
  resolveLifecycleTarget,
  revalidateLifecyclePaths,
  type LifecycleTarget,
  type LimitDecision,
} from '@/app/api/v1/_shared/pro-lifecycle-routes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const multipartVersion = z
  .string()
  .regex(/^(?:0|[1-9]\d*)$/u)
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe());
const uploadFields = z
  .object({
    credentialId: z.string().uuid(),
    expectedVersion: multipartVersion,
    operationId: z.string().uuid(),
  })
  .strict();
const publicCredentialSchema = z
  .object({
    credentialId: z.string().uuid(),
    type: z.literal('pro_license'),
    maskedIdentifier: z
      .string()
      .regex(/^•••• [A-Z0-9]{4}$/u)
      .nullable(),
    issuingAuthority: z.string().nullable(),
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    state: z.enum(PRO_CREDENTIAL_STATES),
    version: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
    supersedesCredentialId: z.string().uuid().nullable(),
  })
  .strict();
const uploadReservationSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('prepared'),
      credentialId: z.string().uuid(),
      evidenceId: z.string().uuid(),
      storagePath: z.string().min(1),
      cleanup: z
        .array(
          z.object({ reservationId: z.string().uuid(), storagePath: z.string().min(1) }).strict(),
        )
        .max(100),
    })
    .strict(),
  z.object({ status: z.literal('complete'), credential: publicCredentialSchema }).strict(),
]);
type SafeMime = 'application/pdf' | 'image/jpeg' | 'image/png';

type Deps = {
  guardCsrf(request: Request): Promise<Response | null>;
  requirePro(): Promise<SessionProfile>;
  resolveTarget(actorId: string): Promise<LifecycleTarget | null>;
  limit(actorId: string, targetId: string): Promise<LimitDecision>;
  inspectFile(bytes: Uint8Array, declaredMime: string): Promise<{ mime: SafeMime } | null>;
  scan(
    bytes: Uint8Array,
    options: { filename: string },
  ): Promise<{ clean: boolean; reason?: string; provider?: string }>;
  store(path: string, bytes: Uint8Array, mime: SafeMime): Promise<'stored' | 'exists'>;
  readExisting(path: string): Promise<{ bytes: Uint8Array; mime: string | null }>;
  reserve(
    actorId: string,
    credentialId: string,
    expectedVersion: number,
    operationId: string,
    evidenceId: string,
    path: string,
    metadata: z.input<typeof proCredentialEvidenceMetadataSchema>,
  ): Promise<unknown>;
  finalize(
    actorId: string,
    credentialId: string,
    expectedVersion: number,
    operationId: string,
    evidenceId: string,
    path: string,
    metadata: z.input<typeof proCredentialEvidenceMetadataSchema>,
  ): Promise<unknown>;
  erase(path: string): Promise<void>;
  revalidate(target: LifecycleTarget, userId: string): void | Promise<void>;
  now(): Date;
};

const defaults: Deps = {
  guardCsrf: async (request) => (await import('@/lib/auth/csrf-guard')).guardCsrf(request),
  requirePro: requireLiveProAccount,
  resolveTarget: (actorId) => resolveLifecycleTarget(actorId, actorId),
  limit: async (actorId, targetId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `credential-upload:${actorId}:${targetId}`,
      routeLabel: 'account-pro-credential-upload',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialUpload,
    });
  },
  inspectFile: async (bytes) => {
    const sniffed = await (await import('file-type')).fileTypeFromBuffer(bytes);
    return sniffed && ['application/pdf', 'image/jpeg', 'image/png'].includes(sniffed.mime)
      ? { mime: sniffed.mime as SafeMime }
      : null;
  },
  scan: async (bytes, options) =>
    (await import('@/lib/security/scan-file')).scanFilePrivate(bytes, options),
  store: async (path, bytes, mime) => {
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
    const { error } = await createSupabaseServiceRoleClient()
      .storage.from('tenant-documents')
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (!error) return 'stored';
    if (error.statusCode === '409' || /already exists|duplicate/iu.test(error.message))
      return 'exists';
    throw new Error('storage_upload_failed');
  },
  readExisting: async (path) => {
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
    const { data, error } = await createSupabaseServiceRoleClient()
      .storage.from('tenant-documents')
      .download(path);
    if (error || !data) throw new Error('storage_read_failed');
    return {
      bytes: new Uint8Array(await data.arrayBuffer()),
      mime: data.type || null,
    };
  },
  reserve: async (...args) =>
    (await import('@/lib/data/pro-credentials')).prepareProCredentialEvidenceUpload(...args),
  finalize: async (...args) =>
    (await import('@/lib/data/pro-credentials')).finalizeProCredentialEvidenceUpload(...args),
  erase: async (path) => {
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
    const { error } = await createSupabaseServiceRoleClient()
      .storage.from('tenant-documents')
      .remove([path]);
    if (error) throw new Error('storage_cleanup_failed');
  },
  revalidate: revalidateLifecyclePaths,
  now: () => new Date(),
};

function safeName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    !/[/\\\u0000-\u001f\u007f]/u.test(name) &&
    name !== '.' &&
    name !== '..'
  );
}

export function createEvidencePostHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request): Promise<Response> => {
    const csrf = await deps.guardCsrf(request);
    if (csrf) return csrf;
    let session: SessionProfile;
    try {
      session = await deps.requirePro();
    } catch {
      return notFoundResponse();
    }
    try {
      const aal = requireAal2Response(session);
      if (aal) return aal;
      const target = await deps.resolveTarget(session.id);
      if (!target) return notFoundResponse();
      const limited = limitResponse(await deps.limit(session.id, target.proProfileId));
      if (limited) return limited;
      let form: FormData;
      try {
        form = await readBoundedFormData(
          request,
          PRO_CREDENTIAL_EVIDENCE_MAX_BYTES + MULTIPART_BODY_ENVELOPE_BYTES,
        );
      } catch (error) {
        return error instanceof BodyTooLargeError
          ? errorResponse('PAYLOAD_TOO_LARGE', 'Upload is too large', 413)
          : errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
      }
      const rawCredentialId = form.get('credentialId');
      if (typeof rawCredentialId !== 'string' || !target.credentialIds.includes(rawCredentialId))
        return notFoundResponse();
      const allowedFields = new Set(['credentialId', 'expectedVersion', 'operationId', 'file']);
      if (
        Array.from(form.keys()).some((key) => !allowedFields.has(key)) ||
        Array.from(allowedFields).some((key) => form.getAll(key).length !== 1)
      )
        return errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
      const fields = uploadFields.safeParse({
        credentialId: rawCredentialId,
        expectedVersion: form.get('expectedVersion'),
        operationId: form.get('operationId'),
      });
      const file = form.get('file');
      if (!fields.success || !(file instanceof File) || !safeName(file.name))
        return errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
      if (file.size === 0) return errorResponse('PAYLOAD_EMPTY', 'File is empty', 400);
      if (file.size > PRO_CREDENTIAL_EVIDENCE_MAX_BYTES)
        return errorResponse('PAYLOAD_TOO_LARGE', 'File is too large', 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const inspected = await deps.inspectFile(bytes, file.type);
      if (!inspected || inspected.mime !== file.type)
        return errorResponse('UNSUPPORTED_MEDIA_TYPE', 'File type is not allowed', 415);
      const scan = await deps.scan(bytes, { filename: file.name });
      if (!scan.clean)
        return scan.reason === 'scanner_unavailable'
          ? errorResponse('SCANNER_UNAVAILABLE', 'File scanner temporarily unavailable', 503)
          : errorResponse('FILE_REJECTED_BY_SCAN', 'File was rejected', 422);
      // A stable create-only path turns a crash after upload into a safely reusable artifact.
      const evidenceId = fields.data.operationId;
      const path = buildProCredentialEvidencePath(
        target.proProfileId,
        fields.data.credentialId,
        evidenceId,
      );
      const metadata = proCredentialEvidenceMetadataSchema.parse({
        mimeType: inspected.mime,
        sizeBytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        originalNameSafe: file.name,
        scanProvider: scan.provider ?? 'unknown',
        scanCompletedAt: deps.now().toISOString(),
      });
      const reservation = uploadReservationSchema.parse(
        await deps.reserve(
          session.id,
          fields.data.credentialId,
          fields.data.expectedVersion,
          fields.data.operationId,
          evidenceId,
          path,
          metadata,
        ),
      );
      if (reservation.status === 'complete') {
        await deps.revalidate(target, session.id);
        return jsonOk({ ok: true, credential: reservation.credential });
      }
      if (
        reservation.credentialId !== fields.data.credentialId ||
        reservation.evidenceId !== evidenceId ||
        reservation.storagePath !== path
      )
        throw new Error('invalid_upload_reservation');
      for (const cleanup of reservation.cleanup) await deps.erase(cleanup.storagePath);
      const stored = await deps.store(path, bytes, inspected.mime);
      if (stored === 'exists') {
        const existing = await deps.readExisting(path);
        const existingHash = createHash('sha256').update(existing.bytes).digest('hex');
        if (
          existing.bytes.byteLength !== bytes.byteLength ||
          existingHash !== metadata.sha256 ||
          existing.mime !== inspected.mime
        )
          return errorResponse('OPERATION_REUSED', 'Unable to complete lifecycle operation', 409);
      }
      let finalized: unknown;
      try {
        finalized = await deps.finalize(
          session.id,
          fields.data.credentialId,
          fields.data.expectedVersion,
          fields.data.operationId,
          evidenceId,
          path,
          metadata,
        );
      } catch (error) {
        if (error instanceof ApiError && error.code === 'EVIDENCE_UPLOAD_RESERVATION_LOST') {
          try {
            await deps.erase(path);
          } catch {
            // A recovery attempt will retry reference-aware cleanup from the durable tombstone.
          }
        }
        throw error;
      }
      const credential = publicCredentialSchema.parse(finalized);
      await deps.revalidate(target, session.id);
      return jsonOk({ ok: true, credential });
    } catch (error) {
      return lifecycleErrorResponse(error, 'account-pro-credential-upload');
    }
  };
}

export const POST = createEvidencePostHandler();
