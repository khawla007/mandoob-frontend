import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { SessionProfile } from '@/lib/auth/require-user';
import { errorResponse, jsonOk } from '@/lib/errors';
import {
  PRO_CREDENTIAL_EVIDENCE_MAX_BYTES,
  proCredentialEvidenceMetadataSchema,
} from '@/lib/validation/pro-lifecycle';
import { buildProCredentialEvidencePath } from '@/lib/storage/pro-credential-path';
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
  store(path: string, bytes: Uint8Array, mime: SafeMime): Promise<void>;
  register(
    actorId: string,
    credentialId: string,
    expectedVersion: number,
    operationId: string,
    evidenceId: string,
    path: string,
    metadata: z.input<typeof proCredentialEvidenceMetadataSchema>,
  ): Promise<unknown>;
  rollback(path: string): Promise<void>;
  revalidate(target: LifecycleTarget, userId: string): void | Promise<void>;
  now(): Date;
  randomId(): string;
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
    (await import('@/lib/security/scan-file')).scanFile(bytes, options),
  store: async (path, bytes, mime) => {
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
    const { error } = await createSupabaseServiceRoleClient()
      .storage.from('tenant-documents')
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw new Error('storage_upload_failed');
  },
  register: async (...args) =>
    (await import('@/lib/data/pro-credentials')).registerProCredentialEvidence(...args),
  rollback: async (path) => {
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
    await createSupabaseServiceRoleClient().storage.from('tenant-documents').remove([path]);
  },
  revalidate: revalidateLifecyclePaths,
  now: () => new Date(),
  randomId: randomUUID,
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
      const form = await request.formData().catch(() => null);
      const rawCredentialId = form?.get('credentialId');
      const target = await deps.resolveTarget(session.id);
      if (
        !target ||
        typeof rawCredentialId !== 'string' ||
        !target.credentialIds.includes(rawCredentialId)
      )
        return notFoundResponse();
      const limited = limitResponse(await deps.limit(session.id, target.proProfileId));
      if (limited) return limited;
      if (!form) return errorResponse('VALIDATION_FAILED', 'Invalid upload', 400);
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
      const evidenceId = deps.randomId();
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
      await deps.store(path, bytes, inspected.mime);
      let credential: unknown;
      try {
        credential = await deps.register(
          session.id,
          fields.data.credentialId,
          fields.data.expectedVersion,
          fields.data.operationId,
          evidenceId,
          path,
          metadata,
        );
      } catch (error) {
        await deps.rollback(path).catch(() => undefined);
        throw error;
      }
      await deps.revalidate(target, session.id);
      return jsonOk({ ok: true, credential });
    } catch (error) {
      return lifecycleErrorResponse(error, 'account-pro-credential-upload');
    }
  };
}

export const POST = createEvidencePostHandler();
