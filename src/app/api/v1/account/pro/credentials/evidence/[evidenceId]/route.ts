import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { SessionProfile } from '@/lib/auth/require-user';
import type { OpenedProCredentialEvidence } from '@/lib/data/pro-credentials';
import type { PreparedProCredentialEvidenceRemoval } from '@/lib/data/pro-credentials';
import { errorResponse, jsonOk } from '@/lib/errors';
import { isOwnedProCredentialEvidencePath } from '@/lib/storage/pro-credential-path';
import {
  BodyTooLargeError,
  JSON_BODY_MAX_BYTES,
  readBoundedJson,
} from '@/app/api/v1/_shared/bounded-body';
import {
  lifecycleErrorResponse,
  limitResponse,
  notFoundResponse,
  requireAal2Response,
  requireLiveLifecycleViewer,
  requireLiveProAccount,
  resolveLifecycleTarget,
  revalidateLifecyclePaths,
  type LifecycleTarget,
  type LimitDecision,
} from '@/app/api/v1/_shared/pro-lifecycle-routes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const uuid = z.string().uuid();
const removeSchema = z
  .object({
    credentialId: uuid,
    expectedVersion: z.number().int().nonnegative(),
    operationId: uuid,
  })
  .strict();
type Context = { params: Promise<{ evidenceId: string }> };

type GetDeps = {
  requireViewer(): Promise<SessionProfile>;
  open(actorId: string, evidenceId: string): Promise<OpenedProCredentialEvidence>;
  issueToken(evidenceId: string, ttlSeconds: number): Promise<string>;
};
const getDefaults: GetDeps = {
  requireViewer: requireLiveLifecycleViewer,
  open: async (...args) =>
    (await import('@/lib/data/pro-credentials')).openProCredentialEvidenceMetadata(...args),
  issueToken: async (evidenceId, ttl) => {
    const { issueProCredentialDownloadToken, PRO_CREDENTIAL_DOWNLOAD_TTL_SECONDS } =
      await import('@/lib/security/pro-credential-download-token');
    if (ttl !== PRO_CREDENTIAL_DOWNLOAD_TTL_SECONDS) throw new Error('invalid_ttl');
    return issueProCredentialDownloadToken(evidenceId);
  },
};

export function createEvidenceGetHandler(overrides: Partial<GetDeps> = {}) {
  const deps = { ...getDefaults, ...overrides };
  return async (_request: Request, context: Context): Promise<Response> => {
    try {
      const session = await deps.requireViewer();
      const aal = requireAal2Response(session);
      if (aal) return aal;
      const { evidenceId } = await context.params;
      if (!uuid.safeParse(evidenceId).success)
        return errorResponse('VALIDATION_FAILED', 'Invalid evidence id', 400);
      let evidence: OpenedProCredentialEvidence;
      try {
        evidence = await deps.open(session.id, evidenceId);
      } catch {
        return notFoundResponse();
      }
      if (
        !isOwnedProCredentialEvidencePath(
          evidence.storage_path,
          evidence.pro_profile_id,
          evidence.credential_id,
          evidence.evidence_id,
        )
      )
        return notFoundResponse();
      try {
        const token = await deps.issueToken(evidence.evidence_id, 300);
        return new Response(null, {
          status: 307,
          headers: {
            location: `/api/v1/account/pro/credentials/evidence/download?token=${encodeURIComponent(token)}`,
            'cache-control': 'no-store',
          },
        });
      } catch {
        return errorResponse('STORAGE_SIGN_FAILED', 'Unable to open evidence', 502);
      }
    } catch {
      return notFoundResponse();
    }
  };
}

type DeleteDeps = {
  guardCsrf(request: Request): Promise<Response | null>;
  requirePro(): Promise<SessionProfile>;
  resolveTarget(actorId: string, proProfileId: string): Promise<LifecycleTarget | null>;
  limit(actorId: string, targetId: string): Promise<LimitDecision>;
  prepare(
    actorId: string,
    credentialId: string,
    evidenceId: string,
    expectedVersion: number,
    operationId: string,
  ): Promise<PreparedProCredentialEvidenceRemoval>;
  finalize(
    actorId: string,
    credentialId: string,
    evidenceId: string,
    expectedVersion: number,
    operationId: string,
  ): Promise<unknown>;
  erase(path: string): Promise<void>;
  revalidate(target: LifecycleTarget, userId: string): void | Promise<void>;
};
const deleteDefaults: DeleteDeps = {
  guardCsrf: async (request) => (await import('@/lib/auth/csrf-guard')).guardCsrf(request),
  requirePro: requireLiveProAccount,
  resolveTarget: (actorId) => resolveLifecycleTarget(actorId, actorId),
  limit: async (actorId, evidenceId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `credential-mutation:${actorId}:${evidenceId}`,
      routeLabel: 'account-pro-evidence-delete',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialMutation,
    });
  },
  prepare: async (...args) =>
    (await import('@/lib/data/pro-credentials')).prepareProCredentialEvidenceRemoval(...args),
  finalize: async (...args) =>
    (await import('@/lib/data/pro-credentials')).finalizeProCredentialEvidenceRemoval(...args),
  erase: async (path) => {
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
    const { error } = await createSupabaseServiceRoleClient()
      .storage.from('tenant-documents')
      .remove([path]);
    // Supabase returns no error for a missing object, making a retry idempotent.
    if (error) throw new Error('storage_cleanup_failed');
  },
  revalidate: revalidateLifecyclePaths,
};

export function createEvidenceDeleteHandler(overrides: Partial<DeleteDeps> = {}) {
  const deps = { ...deleteDefaults, ...overrides };
  return async (request: Request, context: Context): Promise<Response> => {
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
      const { evidenceId } = await context.params;
      if (!uuid.safeParse(evidenceId).success)
        return errorResponse('VALIDATION_FAILED', 'Invalid evidence id', 400);
      const target = await deps.resolveTarget(session.id, session.id);
      if (!target || target.proProfileId !== session.id) return notFoundResponse();
      const limited = limitResponse(await deps.limit(session.id, target.proProfileId));
      if (limited) return limited;
      let raw: unknown;
      try {
        raw = await readBoundedJson(request, JSON_BODY_MAX_BYTES);
      } catch (error) {
        return error instanceof BodyTooLargeError
          ? errorResponse('PAYLOAD_TOO_LARGE', 'Request body is too large', 413)
          : errorResponse('VALIDATION_FAILED', 'Invalid request', 400);
      }
      const rawCredentialId =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>).credentialId : undefined;
      if (typeof rawCredentialId !== 'string' || !target.credentialIds.includes(rawCredentialId))
        return notFoundResponse();
      const parsed = removeSchema.safeParse(raw);
      if (!parsed.success) return errorResponse('VALIDATION_FAILED', 'Invalid request', 400);
      const prepared = await deps.prepare(
        session.id,
        parsed.data.credentialId,
        evidenceId,
        parsed.data.expectedVersion,
        parsed.data.operationId,
      );
      if (prepared.status === 'complete') {
        if (prepared.credential.credentialId !== parsed.data.credentialId)
          return notFoundResponse();
        await deps.revalidate(target, session.id);
        return jsonOk({ ok: true, credential: prepared.credential });
      }
      if (
        prepared.credentialId !== parsed.data.credentialId ||
        prepared.evidenceId !== evidenceId ||
        !isOwnedProCredentialEvidencePath(
          prepared.storagePath,
          session.id,
          parsed.data.credentialId,
          evidenceId,
        )
      )
        return notFoundResponse();
      try {
        await deps.erase(prepared.storagePath);
      } catch {
        return errorResponse('SERVICE_UNAVAILABLE', 'Service temporarily unavailable', 503);
      }
      const credential = await deps.finalize(
        session.id,
        parsed.data.credentialId,
        evidenceId,
        parsed.data.expectedVersion,
        parsed.data.operationId,
      );
      await deps.revalidate(target, session.id);
      return jsonOk({ ok: true, credential });
    } catch (error) {
      return lifecycleErrorResponse(error, 'account-pro-evidence-delete');
    }
  };
}

export const GET = createEvidenceGetHandler();
export const DELETE = createEvidenceDeleteHandler();
