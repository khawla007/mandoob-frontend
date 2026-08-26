import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { SessionProfile } from '@/lib/auth/require-user';
import { errorResponse, jsonOk } from '@/lib/errors';
import {
  proDecisionReasonCodeSchema,
  proDecisionReasonSchema,
} from '@/lib/validation/pro-lifecycle';
import { PRO_CREDENTIAL_STATES } from '@/lib/pro-lifecycle/contracts';
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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const uuid = z.string().uuid();
const publicCredentialSchema = z
  .object({
    credentialId: uuid,
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
    supersedesCredentialId: uuid.nullable(),
  })
  .strict();
const base = {
  credentialId: uuid,
  expectedVersion: z.number().int().nonnegative(),
  operationId: uuid,
} as const;
const reviewSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('create'), operationId: uuid }).strict(),
  z.object({ command: z.literal('begin_review'), ...base }).strict(),
  z.object({ command: z.literal('verify'), ...base }).strict(),
  z
    .object({
      command: z.literal('reject'),
      ...base,
      reasonCode: proDecisionReasonCodeSchema,
      reason: proDecisionReasonSchema,
    })
    .strict(),
  z
    .object({
      command: z.literal('revoke'),
      ...base,
      reasonCode: proDecisionReasonCodeSchema,
      reason: proDecisionReasonSchema,
    })
    .strict(),
]);
type Command = z.infer<typeof reviewSchema>;
type Review = Exclude<Command, { command: 'create' }>;
type Context = { params: Promise<{ id: string }> };

type Deps = {
  guardCsrf(request: Request): Promise<Response | null>;
  requireOperator(): Promise<SessionProfile>;
  resolveTarget(actorId: string, targetId: string): Promise<LifecycleTarget | null>;
  limit(actorId: string, targetId: string): Promise<LimitDecision>;
  create(actorId: string, targetId: string, operationId: string): Promise<unknown>;
  validateReason(proProfileId: string, credentialId: string, reason: string): Promise<void>;
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
  create: async (actorId, targetId, operationId) =>
    (await import('@/lib/data/pro-credentials')).createProCredentialDraft(
      actorId,
      targetId,
      operationId,
    ),
  validateReason: async (...args) =>
    (
      await import('@/lib/data/pro-credential-decision-reason')
    ).assertDecisionReasonExcludesCredentialIdentifier(...args),
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
      const target = await deps.resolveTarget(session.id, id);
      if (!target) return notFoundResponse();
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
      const parsed = reviewSchema.safeParse(raw);
      if (!parsed.success) return errorResponse('VALIDATION_FAILED', 'Invalid request', 400);
      if (parsed.data.command === 'create') {
        const credential = publicCredentialSchema.parse(
          await deps.create(session.id, target.proProfileId, parsed.data.operationId),
        );
        await deps.revalidate(target, id);
        return jsonOk({ ok: true, credential });
      }
      if (!target.credentialIds.includes(parsed.data.credentialId)) return notFoundResponse();
      if (parsed.data.command === 'reject' || parsed.data.command === 'revoke')
        await deps.validateReason(
          target.proProfileId,
          parsed.data.credentialId,
          parsed.data.reason,
        );
      const credential = publicCredentialSchema.parse(
        await deps.review(session.id, parsed.data.credentialId, parsed.data),
      );
      await deps.revalidate(target, id);
      return jsonOk({ ok: true, credential });
    } catch (error) {
      return lifecycleErrorResponse(error, 'admin-credential-review');
    }
  };
}

export const POST = createAdminCredentialPostHandler();
