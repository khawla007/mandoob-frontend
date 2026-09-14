import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { SessionProfile } from '@/lib/auth/require-user';
import { errorResponse, jsonOk } from '@/lib/errors';
import { proCredentialDraftSaveSchema } from '@/lib/validation/pro-lifecycle';
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
  requireLiveProAccount,
  resolveLifecycleTarget,
  revalidateLifecyclePaths,
  type LifecycleTarget,
  type LimitDecision,
} from '@/app/api/v1/_shared/pro-lifecycle-routes';

const uuid = z.string().uuid();
const version = z.number().int().nonnegative();
const operationId = uuid;
const commandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('create'), operationId }).strict(),
  proCredentialDraftSaveSchema.extend({ command: z.literal('save'), credentialId: uuid }).strict(),
  z
    .object({
      command: z.literal('submit'),
      credentialId: uuid,
      expectedVersion: version,
      operationId,
    })
    .strict(),
  z
    .object({
      command: z.literal('replace'),
      credentialId: uuid,
      expectedVersion: version,
      operationId,
    })
    .strict(),
]);
type Command = z.infer<typeof commandSchema>;

type Deps = {
  guardCsrf(request: Request): Promise<Response | null>;
  requirePro(): Promise<SessionProfile>;
  resolveTarget(actorId: string): Promise<LifecycleTarget | null>;
  limit(actorId: string, targetId: string): Promise<LimitDecision>;
  mutate(actorId: string, targetId: string, command: Command): Promise<unknown>;
  revalidate(target: LifecycleTarget, userId: string): void | Promise<void>;
};

const defaults: Deps = {
  guardCsrf: async (request) => (await import('@/lib/auth/csrf-guard')).guardCsrf(request),
  requirePro: requireLiveProAccount,
  resolveTarget: (actorId) => resolveLifecycleTarget(actorId, actorId),
  limit: async (actorId, targetId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `credential-mutation:${actorId}:${targetId}`,
      routeLabel: 'account-pro-credential-mutation',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialMutation,
    });
  },
  mutate: async (actorId, targetId, command) => {
    const data = await import('@/lib/data/pro-credentials');
    switch (command.command) {
      case 'create':
        return data.createProCredentialDraft(actorId, targetId, command.operationId);
      case 'save':
        return data.saveProCredentialDraft(actorId, command.credentialId, command);
      case 'submit':
        return data.submitProCredential(
          actorId,
          command.credentialId,
          command.expectedVersion,
          command.operationId,
        );
      case 'replace':
        return data.createProCredentialReplacement(
          actorId,
          command.credentialId,
          command.expectedVersion,
          command.operationId,
        );
    }
  },
  revalidate: revalidateLifecyclePaths,
};

export function createCredentialPostHandler(overrides: Partial<Deps> = {}) {
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
      if (typeof rawCredentialId === 'string' && !target.credentialIds.includes(rawCredentialId))
        return notFoundResponse();
      const parsed = commandSchema.safeParse(raw);
      if (!parsed.success) return errorResponse('VALIDATION_FAILED', 'Invalid request', 400);
      const credential = await deps.mutate(session.id, target.proProfileId, parsed.data);
      await deps.revalidate(target, session.id);
      return jsonOk({ ok: true, credential });
    } catch (error) {
      return lifecycleErrorResponse(error, 'account-pro-credential-mutation');
    }
  };
}
