'use server';

import 'server-only';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getEmployeeDocumentSignedUrl } from '@/lib/data/employee-portal';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

async function resolveEmployeeCtx(slug: string) {
  const session = await requireRole('employee');
  if (!session.tenantId) throw new ApiError('FORBIDDEN', 'Session missing tenant binding', 403);
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);
  return { session, tenant };
}

export async function getEmployeeDocumentSignedUrlAction(
  slug: string,
  versionId: string,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  try {
    const { session, tenant } = await resolveEmployeeCtx(slug);
    const url = await getEmployeeDocumentSignedUrl(session.id, tenant.id, versionId);
    return {
      ok: true,
      data: { url, expiresAt: new Date(Date.now() + 300_000).toISOString() },
    };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('getEmployeeDocumentSignedUrlAction unexpected error', e);
    return { ok: false, error: 'Could not sign URL', code: 'INTERNAL' };
  }
}
