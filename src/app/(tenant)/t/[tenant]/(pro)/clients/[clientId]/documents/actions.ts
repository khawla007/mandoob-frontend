'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
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
  | { ok: false; error: string; code: string };

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
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
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

    revalidatePath(`/t/${slug}/clients/${parsed.data.client_id}`);
    return { ok: true, data: { requestId: id } };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('requestDocumentAction unexpected error', e);
    return { ok: false, error: 'Could not create request', code: 'INTERNAL' };
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
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
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

    revalidatePath(`/t/${slug}/clients/${clientId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('reviewDocumentVersionAction unexpected error', e);
    return { ok: false, error: 'Could not save review', code: 'INTERNAL' };
  }
}

export async function getDocumentSignedUrlAction(
  slug: string,
  versionId: string,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  try {
    const { tenant } = await resolveAndAuthorize(slug);
    const result = await getDocumentSignedUrl(tenant.id, versionId);
    return { ok: true, data: result };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('getDocumentSignedUrlAction unexpected error', e);
    return { ok: false, error: 'Could not sign URL', code: 'INTERNAL' };
  }
}
