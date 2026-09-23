import { z } from 'zod';

import { getClientIp } from '@/lib/auth/request';
import { env } from '@/lib/env';
import { consumeSensitiveRateLimit } from '@/lib/rate-limit';
import {
  resumeApplicationDraft,
  saveApplicationDraft,
  type DraftSave,
  type DraftView,
  type SaveDraftInput,
} from '@/lib/public-intake/applications';
import { hashRequest, isAllowedPublicOrigin } from '@/lib/public-intake/security';

const MAX_BODY_BYTES = 65_536;
const RESUME_HEADER = 'x-resume-token';

const saveSchema = z
  .object({
    operationId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    answers: z.record(z.string(), z.unknown()),
  })
  .strict();

type Deps = {
  appUrl?: string;
  rateLimit?: (key: string) => Promise<'allowed' | 'limited' | 'unavailable'>;
  resume?: (draftId: string, resumeSecret: string) => Promise<DraftView | null>;
  save?: (input: SaveDraftInput) => Promise<DraftSave>;
};

function resumeToken(request: Request): string | null {
  const token = request.headers.get(RESUME_HEADER);
  if (!token || token.length < 16 || token.length > 512) return null;
  return token;
}

async function limitByIp(request: Request, deps: Deps, correlationId: string) {
  const ip = getClientIp(request);
  const rateLimit =
    deps.rateLimit ??
    ((key: string) =>
      consumeSensitiveRateLimit({
        key,
        capacity: 120,
        refillPerSec: 120 / 3600,
        routeLabel: 'public-application-draft-mutate',
        correlationId,
      }));
  return rateLimit(`p305:draft-mutate:ip:${hashRequest(ip)}`);
}

export async function handleResumeDraftGet(
  request: Request,
  draftId: string,
  deps: Deps = {},
) {
  const token = resumeToken(request);
  if (!token) return fail(404, 'The requested draft is unavailable.');
  const limit = await limitByIp(request, deps, draftId);
  if (limit === 'limited') return rateLimited();
  if (limit === 'unavailable') return unavailable();
  const draft = await (deps.resume ?? resumeApplicationDraft)(draftId, token);
  if (!draft) return fail(404, 'The requested draft is unavailable.');
  return Response.json(
    {
      status: 'success',
      draftId: draft.draftId,
      version: draft.version,
      answers: draft.answers,
      expiresAt: draft.expiresAt,
    },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}

export async function handleSaveDraftPatch(
  request: Request,
  draftId: string,
  deps: Deps = {},
) {
  const appUrl = deps.appUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !isAllowedPublicOrigin(request.headers.get('origin'), appUrl)) {
    return fail(403, 'Request origin is not allowed.');
  }
  const token = resumeToken(request);
  if (!token) return fail(404, 'The requested draft is unavailable.');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail(413, 'Request is too large.');
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, 'Invalid request.');
  }
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'Invalid request.');

  const limit = await limitByIp(request, deps, parsed.data.operationId);
  if (limit === 'limited') return rateLimited();
  if (limit === 'unavailable') return unavailable();

  try {
    const saved = await (deps.save ?? saveApplicationDraft)({
      draftId,
      resumeSecret: token,
      operationId: parsed.data.operationId,
      expectedVersion: parsed.data.expectedVersion,
      answers: parsed.data.answers,
    });
    return Response.json(
      { status: 'success', draftId: saved.draftId, version: saved.version, saved: true },
      { status: 200, headers: { 'cache-control': 'no-store' } },
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
  return unavailable();
}

function fail(status: number, message: string) {
  return Response.json(
    { status: 'failure', message },
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
