import { z } from 'zod';

import { getClientIp } from '@/lib/auth/request';
import { env } from '@/lib/env';
import { consumeSensitiveRateLimit } from '@/lib/rate-limit';
import {
  createApplicationDraft,
  type CreateDraftInput,
  type DraftCreation,
} from '@/lib/public-intake/applications';
import {
  hashRequest,
  isAllowedPublicOrigin,
  verifyPublicTurnstile,
} from '@/lib/public-intake/security';

const MAX_BODY_BYTES = 4_096;
const requestSchema = z
  .object({
    operationId: z.string().uuid(),
    definitionKey: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,63}$/u),
    turnstileToken: z.string().min(1).max(2048).optional(),
  })
  .strict();

type Deps = {
  appUrl?: string;
  turnstileSecret?: string;
  rateLimit?: (key: string) => Promise<'allowed' | 'limited' | 'unavailable'>;
  verifyTurnstile?: typeof verifyPublicTurnstile;
  create?: (input: CreateDraftInput) => Promise<DraftCreation>;
};

export async function handleCreateDraftPost(request: Request, deps: Deps = {}) {
  const appUrl = deps.appUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !isAllowedPublicOrigin(request.headers.get('origin'), appUrl)) {
    return fail(403, 'Request origin is not allowed.');
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail(413, 'Request is too large.');
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, 'Invalid request.');
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'Invalid request.');

  const ip = getClientIp(request);
  const rateLimit =
    deps.rateLimit ??
    ((key: string) =>
      consumeSensitiveRateLimit({
        key,
        capacity: 20,
        refillPerSec: 20 / 3600,
        routeLabel: 'public-application-draft',
        correlationId: parsed.data.operationId,
      }));
  const limit = await rateLimit(`p305:draft:ip:${hashRequest(ip)}`);
  if (limit === 'limited') return rateLimited();
  if (limit === 'unavailable') return unavailable();

  const secret = deps.turnstileSecret ?? env.TURNSTILE_SECRET_KEY;
  if (!secret && process.env.NODE_ENV === 'production') return unavailable();
  if (secret) {
    const verified = await (deps.verifyTurnstile ?? verifyPublicTurnstile)({
      token: parsed.data.turnstileToken ?? '',
      secret,
      expectedHostname: new URL(appUrl).hostname,
      expectedAction: 'application',
      remoteIp: ip,
    });
    if (!verified) return fail(400, 'Verification failed. Please try again.', true);
  }

  try {
    const draft = await (deps.create ?? createApplicationDraft)({
      operationId: parsed.data.operationId,
      definitionKey: parsed.data.definitionKey,
    });
    return Response.json(
      {
        status: 'success',
        draftId: draft.draftId,
        version: draft.version,
        expiresAt: draft.expiresAt,
        resumeSecret: draft.resumeSecret,
      },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'DEFINITION_UNAVAILABLE') {
      return fail(404, 'The requested application is unavailable.');
    }
    return unavailable();
  }
}

function fail(status: number, message: string, retryable = false) {
  return Response.json(
    { status: 'failure', retryable, message },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}
function rateLimited() {
  return Response.json(
    { status: 'rate_limited', retryAfterSeconds: 3600, message: 'Please wait before trying again.' },
    { status: 429, headers: { 'cache-control': 'no-store' } },
  );
}
function unavailable() {
  return Response.json(
    { status: 'unavailable', message: 'Applications are temporarily unavailable.' },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  );
}
