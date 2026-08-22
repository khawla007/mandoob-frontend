import { randomUUID } from 'node:crypto';
import { z } from 'zod';

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
  resolveLifecycleTarget,
  revalidateLifecyclePaths,
  type LifecycleTarget,
  type LimitDecision,
} from '@/app/api/v1/_shared/pro-lifecycle-routes';
import type { SessionProfile } from '@/lib/auth/require-user';
import { errorResponse, jsonOk } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const uuid = z.string().uuid();
const bodySchema = z.object({ credentialId: uuid }).strict();
type Context = { params: Promise<{ id: string; evidenceId: string }> };

type Deps = {
  guardCsrf(request: Request): Promise<Response | null>;
  requireOperator(): Promise<SessionProfile>;
  resolveTarget(actorId: string, targetId: string): Promise<LifecycleTarget | null>;
  limit(actorId: string, targetId: string): Promise<LimitDecision>;
  recover(input: {
    actorId: string;
    proProfileId: string;
    credentialId: string;
    evidenceId: string;
  }): Promise<unknown>;
  revalidate(target: LifecycleTarget, userId: string): void | Promise<void>;
};

const defaults: Deps = {
  guardCsrf: async (request) => (await import('@/lib/auth/csrf-guard')).guardCsrf(request),
  requireOperator: async () => (await import('@/lib/auth/require-role')).requirePlatformOperator(),
  resolveTarget: resolveLifecycleTarget,
  limit: async (actorId, targetId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `evidence-recovery:${actorId}:${targetId}`,
      routeLabel: 'admin-evidence-recovery',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialReview,
    });
  },
  recover: async (input) =>
    (
      await import('@/lib/data/pro-evidence-removal-recovery')
    ).recoverAbandonedProCredentialEvidence(input),
  revalidate: revalidateLifecyclePaths,
};

export function createAdminEvidenceRecoveryPostHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request, context: Context): Promise<Response> => {
    const csrf = await deps.guardCsrf(request);
    if (csrf) return csrf;
    let session: SessionProfile;
    try {
      session = await deps.requireOperator();
    } catch {
      return notFoundResponse();
    }
    const aal = requireAal2Response(session);
    if (aal) return aal;
    try {
      const { id, evidenceId } = await context.params;
      if (!uuid.safeParse(id).success || !uuid.safeParse(evidenceId).success)
        return errorResponse('VALIDATION_FAILED', 'Invalid recovery target', 400);
      const target = await deps.resolveTarget(session.id, id);
      if (!target || target.proProfileId !== id) return notFoundResponse();
      const limited = limitResponse(await deps.limit(session.id, id));
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
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) return errorResponse('VALIDATION_FAILED', 'Invalid request', 400);
      const credential = await deps.recover({
        actorId: session.id,
        proProfileId: target.proProfileId,
        credentialId: parsed.data.credentialId,
        evidenceId,
      });
      await deps.revalidate(target, id);
      return jsonOk({ ok: true, credential });
    } catch (error) {
      return lifecycleErrorResponse(error, 'admin-evidence-recovery');
    }
  };
}

export const POST = createAdminEvidenceRecoveryPostHandler();
