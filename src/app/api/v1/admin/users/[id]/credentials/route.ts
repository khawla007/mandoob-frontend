import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { SessionProfile } from '@/lib/auth/require-user';
import { errorResponse, jsonOk } from '@/lib/errors';
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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const uuid = z.string().uuid();
const base = {
  credentialId: uuid,
  expectedVersion: z.number().int().nonnegative(),
  operationId: uuid,
} as const;
const reason = z.string().trim().min(3).max(500);
const reasonCode = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[A-Z][A-Z0-9_]*$/u);
const reviewSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('begin_review'), ...base }).strict(),
  z.object({ command: z.literal('verify'), ...base }).strict(),
  z.object({ command: z.literal('reject'), ...base, reasonCode, reason }).strict(),
  z.object({ command: z.literal('revoke'), ...base, reasonCode, reason }).strict(),
]);
type Review = z.infer<typeof reviewSchema>;
type Context = { params: Promise<{ id: string }> };

type Deps = {
  guardCsrf(request: Request): Promise<Response | null>;
  requireOperator(): Promise<SessionProfile>;
  resolveTarget(actorId: string, targetId: string): Promise<LifecycleTarget | null>;
  limit(actorId: string, targetId: string): Promise<LimitDecision>;
  review(actorId: string, credentialId: string, input: Review): Promise<unknown>;
  revalidate(target: LifecycleTarget, userId: string): void | Promise<void>;
};
const defaults: Deps = {
  guardCsrf: async (request) => (await import('@/lib/auth/csrf-guard')).guardCsrf(request),
  requireOperator: async () => (await import('@/lib/auth/require-role')).requirePlatformOperator(),
  resolveTarget: (actorId, targetId) => resolveLifecycleTarget(actorId, targetId),
  limit: async (actorId, targetId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `credential-review:${actorId}:${targetId}`,
      routeLabel: 'admin-credential-review',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialReview,
    });
  },
  review: async (actorId, credentialId, input) =>
    (await import('@/lib/data/pro-credentials')).reviewProCredential(actorId, credentialId, input),
  revalidate: revalidateLifecyclePaths,
};

export function createAdminCredentialPostHandler(overrides: Partial<Deps> = {}) {
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
      const { id } = await context.params;
      if (!uuid.safeParse(id).success)
        return errorResponse('VALIDATION_FAILED', 'Invalid user id', 400);
      const raw: unknown = await request.json().catch(() => null);
      const target = await deps.resolveTarget(session.id, id);
      if (!target) return notFoundResponse();
      const rawCredentialId =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>).credentialId : undefined;
      if (typeof rawCredentialId !== 'string' || !target.credentialIds.includes(rawCredentialId))
        return notFoundResponse();
      const limited = limitResponse(await deps.limit(session.id, id));
      if (limited) return limited;
      const parsed = reviewSchema.safeParse(raw);
      if (!parsed.success) return errorResponse('VALIDATION_FAILED', 'Invalid request', 400);
      const credential = await deps.review(session.id, parsed.data.credentialId, parsed.data);
      await deps.revalidate(target, id);
      return jsonOk({ ok: true, credential });
    } catch (error) {
      return lifecycleErrorResponse(error, 'admin-credential-review');
    }
  };
}

export const POST = createAdminCredentialPostHandler();
