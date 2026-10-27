import { z } from 'zod';

import { ApiError } from '@/lib/errors';
import { getClientIp } from '@/lib/auth/request';
import { env } from '@/lib/env';
import { consumeSensitiveRateLimit } from '@/lib/rate-limit';
import {
  deleteDraftAttachment,
  uploadDraftAttachment,
  MAX_ATTACHMENT_BYTES,
  type AttachmentReceipt,
  type DeleteAttachmentInput,
  type UploadAttachmentInput,
} from '@/lib/public-intake/attachments';
import { hashRequest, isAllowedPublicOrigin } from '@/lib/public-intake/security';

const RESUME_HEADER = 'x-resume-token';
const FIELD_ID = /^[a-z][a-z0-9_]{1,63}$/u;
const deleteSchema = z
  .object({ attachmentId: z.string().uuid(), operationId: z.string().uuid() })
  .strict();

type Deps = {
  appUrl?: string;
  rateLimit?: (key: string) => Promise<'allowed' | 'limited' | 'unavailable'>;
  upload?: (input: UploadAttachmentInput) => Promise<AttachmentReceipt>;
  remove?: (input: DeleteAttachmentInput) => Promise<{ deleted: true }>;
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
        capacity: 60,
        refillPerSec: 60 / 3600,
        routeLabel: 'public-application-attachment',
        correlationId,
      }));
  return rateLimit(`p305:attachment:ip:${hashRequest(ip)}`);
}

export async function handleUploadAttachmentPost(request: Request, draftId: string, deps: Deps = {}) {
  const appUrl = deps.appUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !isAllowedPublicOrigin(request.headers.get('origin'), appUrl)) {
    return fail(403, 'Request origin is not allowed.');
  }
  const token = resumeToken(request);
  if (!token) return fail(404, 'The requested draft is unavailable.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'Invalid request.');
  }
  const file = form.get('file');
  const fieldId = form.get('fieldId');
  const operationId = form.get('operationId');
  if (
    !(file instanceof File) ||
    typeof fieldId !== 'string' ||
    !FIELD_ID.test(fieldId) ||
    typeof operationId !== 'string' ||
    !z.string().uuid().safeParse(operationId).success
  ) {
    return fail(400, 'Invalid request.');
  }
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return fail(413, 'The attachment is empty or too large.');
  }

  const limit = await limitByIp(request, deps, operationId);
  if (limit === 'limited') return rateLimited();
  if (limit === 'unavailable') return unavailable();

  try {
    const receipt = await (deps.upload ?? uploadDraftAttachment)({
      draftId,
      resumeSecret: token,
      operationId,
      fieldId,
      file: {
        data: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
        mimeType: file.type,
      },
    });
    return Response.json(
      { status: 'success', ...receipt },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return mapError(error);
  }
}

export async function handleDeleteAttachment(request: Request, draftId: string, deps: Deps = {}) {
  const appUrl = deps.appUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !isAllowedPublicOrigin(request.headers.get('origin'), appUrl)) {
    return fail(403, 'Request origin is not allowed.');
  }
  const token = resumeToken(request);
  if (!token) return fail(404, 'The requested draft is unavailable.');
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, 'Invalid request.');
  }
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'Invalid request.');

  const limit = await limitByIp(request, deps, parsed.data.operationId);
  if (limit === 'limited') return rateLimited();
  if (limit === 'unavailable') return unavailable();

  try {
    await (deps.remove ?? deleteDraftAttachment)({
      attachmentId: parsed.data.attachmentId,
      draftId,
      resumeSecret: token,
    });
    return Response.json(
      { status: 'success', deleted: true },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return mapError(error);
  }
}

function mapError(error: unknown) {
  if (error instanceof ApiError) {
    // Validation/media/size errors carry a safe status from the P3.07 primitive.
    return fail(error.status, 'The attachment could not be accepted.');
  }
  const message = error instanceof Error ? error.message : 'ATTACHMENT_UNAVAILABLE';
  if (message === 'MALWARE_DETECTED') return fail(422, 'The attachment failed a security scan.');
  if (message === 'SCANNER_UNAVAILABLE') return unavailable();
  if (message === 'ATTACHMENT_DUPLICATE') {
    return fail(409, 'This file was already attached to the field.');
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
    { status: 'unavailable', message: 'Attachments are temporarily unavailable.' },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  );
}
