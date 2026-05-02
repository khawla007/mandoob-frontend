'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { provisionTenant } from '@/lib/data/provision-tenant';
import { provisionTenantSchema } from '@/lib/validation/tenant-onboarding';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAuthEvent } from '@/lib/logging/auth-events';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

async function getCallerContext() {
  const session = await requireRole('super_admin');
  const hdr = await headers();
  const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = hdr.get('user-agent') ?? null;
  return {
    caller: { id: session.id, role: session.role!, tenantId: session.tenantId },
    ip,
    userAgent,
  };
}

const adminCreateProFirmSchema = provisionTenantSchema
  .omit({ status: true, source: true })
  .extend({});

export async function createProFirmAction(
  raw: unknown,
): Promise<ActionResult<{ tenantId: string; adminUserId: string; slug: string }>> {
  try {
    const parsed = adminCreateProFirmSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
    const ctx = await getCallerContext();
    const result = await provisionTenant(
      { ...parsed.data, status: 'active', source: 'admin' },
      ctx,
    );
    revalidatePath('/admin/pro-firms');
    return {
      ok: true,
      data: { tenantId: result.tenantId, adminUserId: result.adminUserId, slug: parsed.data.slug },
    };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('createProFirmAction unexpected error', e);
    return { ok: false, error: 'Could not create PRO firm', code: 'INTERNAL' };
  }
}

const tenantIdSchema = z.string().uuid();

export async function suspendTenantAction(tenantId: string): Promise<ActionResult> {
  return setTenantStatusAction(tenantId, 'suspended', 'tenant_suspended');
}

export async function reactivateTenantAction(tenantId: string): Promise<ActionResult> {
  return setTenantStatusAction(tenantId, 'active', 'tenant_reactivated');
}

async function setTenantStatusAction(
  tenantId: string,
  next: 'active' | 'suspended',
  eventKind: 'tenant_suspended' | 'tenant_reactivated',
): Promise<ActionResult> {
  try {
    if (!tenantIdSchema.safeParse(tenantId).success) {
      return { ok: false, error: 'Invalid tenant id', code: 'VALIDATION_FAILED' };
    }
    const ctx = await getCallerContext();
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin.from('tenants').update({ status: next }).eq('id', tenantId);
    if (error) {
      console.error('tenant status update failed', error);
      return { ok: false, error: 'Could not update tenant', code: 'INTERNAL' };
    }
    await admin.from('tenant_audit_log').insert({
      tenant_id: tenantId,
      actor_id: ctx.caller.id,
      action: next === 'suspended' ? 'suspended' : 'reactivated',
      source: 'admin',
      details: {},
    });
    await recordAuthEvent({
      kind: eventKind,
      actorUserId: ctx.caller.id,
      tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { next_status: next },
    }).catch((err) => console.error('recordAuthEvent failed', err));
    revalidatePath('/admin/pro-firms');
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('setTenantStatusAction unexpected error', e);
    return { ok: false, error: 'Could not update tenant', code: 'INTERNAL' };
  }
}
