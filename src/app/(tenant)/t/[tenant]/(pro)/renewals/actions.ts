'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  cancelRenewal,
  createRenewal,
  markRenewalCompleted,
  updateRenewal,
  type RenewalActorCtx,
} from '@/lib/data/renewals';
import { createRenewalSchema, updateRenewalSchema } from '@/lib/validation/renewal';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

async function getCallerContext() {
  const session = await requireRole('pro', 'admin');
  const hdr = await headers();
  const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = hdr.get('user-agent') ?? null;
  return {
    caller: { id: session.id, role: session.role as 'pro' | 'admin', tenantId: session.tenantId },
    ip,
    userAgent,
  };
}

async function resolveAndAuthorize(
  slug: string,
): Promise<{ ctx: RenewalActorCtx; tenantId: string }> {
  const { caller } = await getCallerContext();
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (caller.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);
  return {
    ctx: { tenantId: tenant.id, actorId: caller.id, role: caller.role },
    tenantId: tenant.id,
  };
}

function toResult(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  console.error(fallback, e);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

export async function createRenewalAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createRenewalSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'INVALID_INPUT' };
    }
    const { ctx } = await resolveAndAuthorize(slug);
    const { id } = await createRenewal(ctx, parsed.data);
    revalidatePath(`/t/${slug}/renewals`);
    revalidatePath(`/t/${slug}/clients/${parsed.data.client_id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return toResult(e, 'Could not create renewal');
  }
}

export async function updateRenewalAction(
  slug: string,
  renewalId: string,
  raw: unknown,
): Promise<ActionResult<void>> {
  try {
    const parsed = updateRenewalSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'INVALID_INPUT' };
    }
    const { ctx } = await resolveAndAuthorize(slug);
    await updateRenewal(renewalId, ctx, parsed.data);
    revalidatePath(`/t/${slug}/renewals`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not update renewal');
  }
}

export async function completeRenewalAction(
  slug: string,
  renewalId: string,
): Promise<ActionResult<void>> {
  try {
    const { ctx } = await resolveAndAuthorize(slug);
    await markRenewalCompleted(renewalId, ctx);
    revalidatePath(`/t/${slug}/renewals`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not mark renewal completed');
  }
}

export async function cancelRenewalAction(
  slug: string,
  renewalId: string,
): Promise<ActionResult<void>> {
  try {
    const { ctx } = await resolveAndAuthorize(slug);
    const admin = createSupabaseServiceRoleClient();
    const { data: row, error } = await admin
      .from('renewals')
      .select('id, tenant_id, source')
      .eq('id', renewalId)
      .maybeSingle();
    if (error) throw new ApiError('INTERNAL', error.message, 500);
    if (!row) throw new ApiError('NOT_FOUND', 'renewal not found', 404);
    if (row.tenant_id !== ctx.tenantId) {
      throw new ApiError('FORBIDDEN', 'renewal belongs to a different tenant', 403);
    }
    if (row.source === 'license_backfill') {
      return {
        ok: false,
        code: 'RENEWAL_LICENSE_LOCKED',
        error: "Clear the client's license_expiry instead.",
      };
    }
    await cancelRenewal(renewalId, ctx);
    revalidatePath(`/t/${slug}/renewals`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not cancel renewal');
  }
}
