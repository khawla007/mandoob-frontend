'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  createDocumentRequest,
  getDocumentSignedUrl,
  setDocumentReview,
} from '@/lib/data/documents';
import { createDocumentRequestSchema, documentReviewSchema } from '@/lib/validation/document';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; messageKey: string };

const uuidSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());

const FAILURE_COPY = {
  VALIDATION_FAILED: {
    error: 'Invalid document action',
    messageKey: 'documents.errors.validation',
  },
  FORBIDDEN: { error: 'Action not allowed', messageKey: 'documents.errors.forbidden' },
  NOT_FOUND: { error: 'Document not found', messageKey: 'documents.errors.notFound' },
  TENANT_NOT_FOUND: { error: 'Firm not found', messageKey: 'documents.errors.notFound' },
  TENANT_INACTIVE: {
    error: 'Firm is inactive',
    messageKey: 'documents.errors.tenantInactive',
  },
  STORAGE_SIGN_FAILED: {
    error: 'Could not open document',
    messageKey: 'documents.errors.openFailed',
  },
} as const;

function actionFailure(code: keyof typeof FAILURE_COPY): ActionResult<never> {
  return { ok: false, code, ...FAILURE_COPY[code] };
}

function sanitizeError(error: unknown, label: string): ActionResult<never> {
  if (error instanceof ApiError && error.code in FAILURE_COPY) {
    return actionFailure(error.code as keyof typeof FAILURE_COPY);
  }
  console.error(label, error);
  return {
    ok: false,
    error: 'Document action failed',
    code: 'INTERNAL',
    messageKey: 'documents.errors.unexpected',
  };
}

async function getCallerContext() {
  const session = await requireRole('pro');
  const hdr = await headers();
  const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = hdr.get('user-agent') ?? null;
  return {
    caller: { id: session.id, role: session.role as 'pro', tenantId: session.tenantId },
    ip,
    userAgent,
  };
}

async function resolveAndAuthorize(slug: string) {
  const ctx = await getCallerContext();
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (ctx.caller.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);
  return { ctx, tenant };
}

export async function requestDocumentAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<{ requestId: string }>> {
  try {
    const parsed = createDocumentRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return actionFailure('VALIDATION_FAILED');
    }
    const { ctx, tenant } = await resolveAndAuthorize(slug);

    const { id } = await createDocumentRequest(
      {
        tenantId: tenant.id,
        actorId: ctx.caller.id,
        role: ctx.caller.role,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      parsed.data,
    );

    revalidatePath(`/t/${slug}/documents`);
    revalidatePath(`/t/${slug}/clients/${parsed.data.client_id}`);
    return { ok: true, data: { requestId: id } };
  } catch (e) {
    return sanitizeError(e, 'requestDocumentAction unexpected error');
  }
}

export async function reviewDocumentVersionAction(
  slug: string,
  clientId: string,
  versionId: string,
  raw: unknown,
): Promise<ActionResult<void>> {
  try {
    const parsed = documentReviewSchema.safeParse(raw);
    const parsedClientId = uuidSchema.safeParse(clientId);
    if (!parsed.success || !parsedClientId.success) return actionFailure('VALIDATION_FAILED');
    const { ctx, tenant } = await resolveAndAuthorize(slug);

    await setDocumentReview(
      versionId,
      {
        tenantId: tenant.id,
        actorId: ctx.caller.id,
        role: ctx.caller.role,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      parsed.data,
    );

    revalidatePath(`/t/${slug}/documents`);
    revalidatePath(`/t/${slug}/clients/${parsedClientId.data}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return sanitizeError(e, 'reviewDocumentVersionAction unexpected error');
  }
}

export async function getDocumentSignedUrlAction(
  slug: string,
  versionId: string,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  try {
    const { tenant } = await resolveAndAuthorize(slug);
    const result = await getDocumentSignedUrl(tenant.id, versionId);
    return { ok: true, data: { url: result.url, expiresAt: result.expiresAt } };
  } catch (e) {
    return sanitizeError(e, 'getDocumentSignedUrlAction unexpected error');
  }
}
