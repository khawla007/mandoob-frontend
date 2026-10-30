import { z } from 'zod';

import { getClientIp } from '@/lib/auth/request';
import { env } from '@/lib/env';
import { consumeSensitiveRateLimit } from '@/lib/rate-limit';
import {
  resumeApplicationDraft,
  submitApplication,
  type ApplicationSubmission,
  type DraftView,
  type SubmitApplicationInput,
} from '@/lib/public-intake/applications';
import {
  hashRequest,
  isAllowedPublicOrigin,
  verifyPublicTurnstile,
} from '@/lib/public-intake/security';

const MAX_BODY_BYTES = 4_096;
const RESUME_HEADER = 'x-resume-token';

const submitSchema = z
  .object({
    operationId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    consent: z
      .object({
        version: z.string().min(1).max(80),
        acceptedAt: z.string().datetime(),
      })
      .strict(),
    turnstileToken: z.string().min(1).max(2048).optional(),
  })
  .strict();

type Deps = {
  appUrl?: string;
  turnstileSecret?: string;
  rateLimit?: (key: string) => Promise<'allowed' | 'limited' | 'unavailable'>;
  verifyTurnstile?: typeof verifyPublicTurnstile;
  resume?: (draftId: string, resumeSecret: string) => Promise<DraftView | null>;
  submit?: (input: SubmitApplicationInput) => Promise<ApplicationSubmission>;
};

export async function handleSubmitApplicationPost(
  request: Request,
  draftId: string,
  deps: Deps = {},
) {
  const appUrl = deps.appUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !isAllowedPublicOrigin(request.headers.get('origin'), appUrl)) {
    return fail(403, 'Request origin is not allowed.');
  }
  const token = request.headers.get(RESUME_HEADER);
  if (!token || token.length < 16 || token.length > 512) {
    return fail(404, 'The requested draft is unavailable.');
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
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'Invalid request.');

  const ip = getClientIp(request);
  const rateLimit =
    deps.rateLimit ??
    ((key: string) =>
      consumeSensitiveRateLimit({
        key,
        capacity: 10,
        refillPerSec: 10 / 3600,
        routeLabel: 'public-application-submit',
        correlationId: parsed.data.operationId,
      }));
  const limit = await rateLimit(`p305:submit:ip:${hashRequest(ip)}`);
  if (limit === 'limited') return rateLimited();
  if (limit === 'unavailable') return unavailable();

  const secret = deps.turnstileSecret ?? env.TURNSTILE_SECRET_KEY;
  if (!secret && process.env.NODE_ENV === 'production') return unavailable();
  if (secret) {
    const verified = await (deps.verifyTurnstile ?? verifyPublicTurnstile)({
      token: parsed.data.turnstileToken ?? '',
      secret,
      expectedHostname: new URL(appUrl).hostname,
      expectedAction: 'application-submit',
      remoteIp: ip,
    });
    if (!verified) return fail(400, 'Verification failed. Please try again.', true);
  }

  const draft = await (deps.resume ?? resumeApplicationDraft)(draftId, token);
  if (!draft) return fail(404, 'The requested draft is unavailable.');
  if (draft.version !== parsed.data.expectedVersion) {
    return Response.json(
      { status: 'conflict', message: 'This draft was updated elsewhere. Reload and try again.' },
      { status: 409, headers: { 'cache-control': 'no-store' } },
    );
  }

  try {
    const estimate = draft.answers.estimate;
    const submitted = await (deps.submit ?? submitApplication)({
      draftId,
      resumeSecret: token,
      operationId: parsed.data.operationId,
      expectedVersion: draft.version,
      answers: draft.answers,
      estimateData:
        estimate && typeof estimate === 'object'
          ? (estimate as Record<string, unknown>)
          : null,
      consentProvenance: {
        version: parsed.data.consent.version,
        acceptedAt: parsed.data.consent.acceptedAt,
        scopeHash: hashRequest({ ip }),
      },
    });
    return Response.json(
      {
        status: 'success',
        applicationId: submitted.applicationId,
        leadId: submitted.leadId,
        deliveryState: submitted.deliveryState,
        message: 'Your application was accepted. Acknowledgement delivery is pending.',
      },
      { status: 202, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return mapError(error);
  }
}

function mapError(error: unknown) {
  const message = error instanceof Error ? error.message : 'INTAKE_UNAVAILABLE';
  if (message === 'VERSION_CONFLICT' || message === 'OPERATION_CONFLICT') {
    return Response.json(
      { status: 'conflict', message: 'This draft was updated elsewhere. Reload and try again.' },
      { status: 409, headers: { 'cache-control': 'no-store' } },
    );
  }
  if (message === 'DRAFT_UNAVAILABLE') return fail(404, 'The requested draft is unavailable.');
  if (message === 'ATTACHMENT_NOT_READY') {
    return fail(409, 'Some attachments are still being processed. Try again shortly.');
  }
  return unavailable();
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
