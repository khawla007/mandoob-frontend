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

export async function approveTenantAction(tenantId: string): Promise<ActionResult> {
  try {
    if (!tenantIdSchema.safeParse(tenantId).success) {
      return { ok: false, error: 'Invalid tenant id', code: 'VALIDATION_FAILED' };
    }
    const ctx = await getCallerContext();
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin
      .from('tenants')
      .update({ status: 'active' })
      .eq('id', tenantId)
      .eq('status', 'pending');
    if (error) {
      console.error('approve tenant update failed', error);
      return { ok: false, error: 'Could not approve tenant', code: 'INTERNAL' };
    }
    await admin.from('tenant_audit_log').insert({
      tenant_id: tenantId,
      actor_id: ctx.caller.id,
      action: 'approved',
      source: 'admin',
      details: {},
    });
    await recordAuthEvent({
      kind: 'tenant_approved',
      actorUserId: ctx.caller.id,
      tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: {},
    }).catch((err) => console.error('recordAuthEvent failed', err));
    revalidatePath('/admin/pro-firms');
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('approveTenantAction unexpected error', e);
    return { ok: false, error: 'Could not approve tenant', code: 'INTERNAL' };
  }
}

export async function rejectTenantAction(tenantId: string): Promise<ActionResult> {
  try {
    if (!tenantIdSchema.safeParse(tenantId).success) {
      return { ok: false, error: 'Invalid tenant id', code: 'VALIDATION_FAILED' };
    }
    const ctx = await getCallerContext();
    const admin = createSupabaseServiceRoleClient();

    // Audit row first (tenant cascade-deletes it otherwise).
    await admin.from('tenant_audit_log').insert({
      tenant_id: tenantId,
      actor_id: ctx.caller.id,
      action: 'rejected',
      source: 'admin',
      details: {},
    });

    // Find the PRO admin user(s) bound to this tenant so we can delete
    // them too — rejection should leave no auth account behind.
    const { data: members } = await admin.from('profiles').select('id').eq('tenant_id', tenantId);
    for (const m of members ?? []) {
      const { error: delErr } = await admin.auth.admin.deleteUser(m.id as string);
      if (delErr) console.error('reject: deleteUser failed', { id: m.id, delErr });
    }

    const { error: tErr } = await admin
      .from('tenants')
      .delete()
      .eq('id', tenantId)
      .eq('status', 'pending');
    if (tErr) {
      console.error('reject tenant delete failed', tErr);
      return { ok: false, error: 'Could not reject tenant', code: 'INTERNAL' };
    }

    await recordAuthEvent({
      kind: 'tenant_rejected',
      actorUserId: ctx.caller.id,
      tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: {},
    }).catch((err) => console.error('recordAuthEvent failed', err));
    revalidatePath('/admin/pro-firms');
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('rejectTenantAction unexpected error', e);
    return { ok: false, error: 'Could not reject tenant', code: 'INTERNAL' };
  }
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
