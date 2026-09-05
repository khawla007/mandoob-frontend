'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import {
  cancelRenewal,
  createRenewal,
  markRenewalCompleted,
  updateRenewal,
  type RenewalActorCtx,
} from '@/lib/data/renewals';
import { createRenewalActionSchema, updateRenewalSchema } from '@/lib/validation/renewal';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

function revalidateRenewalRoutes(slug: string) {
  revalidatePath(`/t/${slug}/renewals`);
  revalidatePath(`/t/${slug}/company`);
  revalidatePath(`/t/${slug}/dashboard`);
}

async function resolveAndAuthorize(
  slug: string,
): Promise<{ ctx: RenewalActorCtx; tenantId: string }> {
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'No active company assignment', 403);
  }
  return {
    ctx: {
      tenantId: tenant.id,
      companyId: company.id,
      actorId: session.id,
      role: session.role,
    },
    tenantId: tenant.id,
  };
}

function toResult(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof ApiError) {
    if (e.code === 'INTERNAL') console.error(fallback, e);
    const messages: Record<string, string> = {
      FORBIDDEN: 'This renewal is outside your assigned Company.',
      NOT_FOUND: 'The renewal is no longer available.',
      RENEWAL_DUPLICATE: 'A matching renewal already exists.',
      TENANT_INACTIVE: 'Renewal changes are unavailable while the workspace is inactive.',
    };
    return { ok: false, error: messages[e.code] ?? fallback, code: e.code };
  }
  console.error(fallback, e);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

export async function createRenewalAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createRenewalActionSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'INVALID_INPUT' };
    }
    const { ctx } = await resolveAndAuthorize(slug);
    const { id } = await createRenewal(ctx, { ...parsed.data, company_id: ctx.companyId });
    revalidateRenewalRoutes(slug);
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
    revalidateRenewalRoutes(slug);
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
    revalidateRenewalRoutes(slug);
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
      .select('id, tenant_id, company_id, source')
      .eq('id', renewalId)
      .maybeSingle();
    if (error) throw new ApiError('INTERNAL', error.message, 500);
    if (!row) throw new ApiError('NOT_FOUND', 'renewal not found', 404);
    if (row.tenant_id !== ctx.tenantId || row.company_id !== ctx.companyId) {
      throw new ApiError('FORBIDDEN', 'renewal belongs to a different company', 403);
    }
    if (row.source === 'license_backfill') {
      return {
        ok: false,
        code: 'RENEWAL_LICENSE_LOCKED',
        error: "Clear the company's license_expiry instead.",
      };
    }
    await cancelRenewal(renewalId, ctx);
    revalidateRenewalRoutes(slug);
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not cancel renewal');
  }
}
