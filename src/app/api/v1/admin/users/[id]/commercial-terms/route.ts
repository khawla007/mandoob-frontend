import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { SessionProfile } from '@/lib/auth/require-user';
import { errorResponse, jsonOk } from '@/lib/errors';
import { isValidCalendarDate } from '@/lib/validation/calendar-date';
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
const version = z.number().int().nonnegative();
const date = z.string().refine(isValidCalendarDate);
const draft = z
  .object({
    command: z.literal('create_draft'),
    termKind: z.enum(['pricing', 'compensation']),
    model: z.enum(['per_registration', 'retainer']),
    currency: z.literal('AED'),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    retainerInterval: z.enum(['monthly', 'annual']).nullable(),
    effectiveFrom: date,
    effectiveTo: date.nullable(),
    operationId: uuid,
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.model === 'retainer') !== (value.retainerInterval !== null))
      ctx.addIssue({ code: 'custom', path: ['retainerInterval'], message: 'Invalid interval' });
    if (value.effectiveTo !== null && value.effectiveTo < value.effectiveFrom)
      ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'Invalid range' });
  });
const activate = z
  .object({
    command: z.literal('activate'),
    termId: uuid,
    expectedVersion: version,
    operationId: uuid,
  })
  .strict();
const end = z
  .object({
    command: z.literal('end'),
    termId: uuid,
    expectedVersion: version,
    operationId: uuid,
    effectiveTo: date,
  })
  .strict();
const termCommand = z.union([draft, activate, end]);
type TermCommand = z.infer<typeof termCommand>;
type Context = { params: Promise<{ id: string }> };

type Deps = {
  guardCsrf(request: Request): Promise<Response | null>;
  requireOperator(): Promise<SessionProfile>;
  resolveTarget(actorId: string, targetId: string): Promise<LifecycleTarget | null>;
  limit(actorId: string, targetId: string): Promise<LimitDecision>;
  mutate(actorId: string, targetId: string, command: TermCommand): Promise<unknown>;
  revalidate(target: LifecycleTarget, userId: string): void | Promise<void>;
};
const defaults: Deps = {
  guardCsrf: async (request) => (await import('@/lib/auth/csrf-guard')).guardCsrf(request),
  requireOperator: async () => (await import('@/lib/auth/require-role')).requirePlatformOperator(),
  resolveTarget: (actorId, targetId) => resolveLifecycleTarget(actorId, targetId, true),
  limit: async (actorId, targetId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `commercial-term:${actorId}:${targetId}`,
      routeLabel: 'admin-commercial-term',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialMutation,
    });
  },
  mutate: async (actorId, targetId, command) => {
    const data = await import('@/lib/data/pro-commercial-terms');
    switch (command.command) {
      case 'create_draft': {
        return data.createProCommercialTermDraft(actorId, targetId, {
          termKind: command.termKind,
          model: command.model,
          currency: command.currency,
          amountMinor: command.amountMinor,
          retainerInterval: command.retainerInterval,
          effectiveFrom: command.effectiveFrom,
          effectiveTo: command.effectiveTo,
          operationId: command.operationId,
        });
      }
      case 'activate':
        return data.activateProCommercialTerm(
          actorId,
          command.termId,
          command.expectedVersion,
          command.operationId,
        );
      case 'end':
        return data.endProCommercialTerm(
          actorId,
          command.termId,
          command.expectedVersion,
          command.operationId,
          command.effectiveTo,
        );
    }
  },
  revalidate: revalidateLifecyclePaths,
};

export function createCommercialTermPostHandler(overrides: Partial<Deps> = {}) {
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
      const rawTermId =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>).termId : undefined;
      if (typeof rawTermId === 'string' && !(target.termIds ?? []).includes(rawTermId))
        return notFoundResponse();
      const parsed = termCommand.safeParse(raw);
      if (!parsed.success) return errorResponse('VALIDATION_FAILED', 'Invalid request', 400);
      const term = await deps.mutate(session.id, id, parsed.data);
      await deps.revalidate(target, id);
      return jsonOk({ ok: true, term });
    } catch (error) {
      return lifecycleErrorResponse(error, 'admin-commercial-term');
    }
  };
}

export const POST = createCommercialTermPostHandler();
