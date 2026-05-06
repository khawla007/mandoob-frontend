'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createClientSchema, updateClientSchema } from '@/lib/validation/client';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

async function getCallerContext() {
  const session = await requireRole('pro', 'super_admin');
  const hdr = await headers();
  const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = hdr.get('user-agent') ?? null;
  return {
    caller: { id: session.id, role: session.role!, tenantId: session.tenantId },
    ip,
    userAgent,
  };
}

function emptyToNull(v: string | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export async function createClientAction(
  tenantSlug: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createClientSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
    const ctx = await getCallerContext();

    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) return { ok: false, error: 'Tenant not found', code: 'TENANT_NOT_FOUND' };

    if (ctx.caller.role !== 'super_admin' && ctx.caller.tenantId !== tenant.id) {
      return { ok: false, error: 'Cross-tenant access denied', code: 'FORBIDDEN' };
    }

    await requireActiveTenant(tenant.id);

    const admin = createSupabaseServiceRoleClient();
    const { data: row, error } = await admin
      .from('clients')
      .insert({
        tenant_id: tenant.id,
        company_name: parsed.data.company_name,
        trade_license_no: emptyToNull(parsed.data.trade_license_no),
        jurisdiction: emptyToNull(parsed.data.jurisdiction),
        license_expiry: emptyToNull(parsed.data.license_expiry),
        status: 'onboarding',
      })
      .select('id')
      .single();

    if (error || !row) {
      console.error('createClient insert failed', error);
      return { ok: false, error: 'Could not create client', code: 'INTERNAL' };
    }

    await admin.from('tenant_audit_log').insert({
      tenant_id: tenant.id,
      actor_id: ctx.caller.id,
      action: 'updated',
      source: 'self_serve',
      details: { entity: 'client', client_id: row.id, op: 'create' },
    });

    await recordAuthEvent({
      kind: 'tenant_self_updated',
      actorUserId: ctx.caller.id,
      tenantId: tenant.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { entity: 'client', op: 'create' },
    }).catch((err) => console.error('recordAuthEvent failed', err));

    revalidatePath(`/t/${tenantSlug}/clients`);
    return { ok: true, data: { id: row.id as string } };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('createClientAction unexpected error', e);
    return { ok: false, error: 'Could not create client', code: 'INTERNAL' };
  }
}

export async function updateClientAction(
  tenantSlug: string,
  clientId: string,
  raw: unknown,
): Promise<ActionResult<{ id: string; changed_keys: string[] }>> {
  try {
    const parsed = updateClientSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
    const ctx = await getCallerContext();

    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) return { ok: false, error: 'Tenant not found', code: 'TENANT_NOT_FOUND' };

    if (ctx.caller.role !== 'super_admin' && ctx.caller.tenantId !== tenant.id) {
      return { ok: false, error: 'Cross-tenant access denied', code: 'FORBIDDEN' };
    }

    await requireActiveTenant(tenant.id);

    const admin = createSupabaseServiceRoleClient();

    const { data: existing, error: readErr } = await admin
      .from('clients')
      .select('id, company_name, trade_license_no, jurisdiction, license_expiry')
      .eq('id', clientId)
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (readErr) {
      console.error('updateClient read failed', readErr);
      return { ok: false, error: 'Could not load client', code: 'INTERNAL' };
    }
    if (!existing) {
      return { ok: false, error: 'Client not found', code: 'NOT_FOUND' };
    }

    const next = {
      company_name: parsed.data.company_name,
      trade_license_no: emptyToNull(parsed.data.trade_license_no),
      jurisdiction: emptyToNull(parsed.data.jurisdiction),
      license_expiry: emptyToNull(parsed.data.license_expiry),
    };

    const changed_keys: string[] = [];
    if (next.company_name !== existing.company_name) changed_keys.push('company_name');
    if (next.trade_license_no !== existing.trade_license_no) changed_keys.push('trade_license_no');
    if (next.jurisdiction !== existing.jurisdiction) changed_keys.push('jurisdiction');
    if (next.license_expiry !== existing.license_expiry) changed_keys.push('license_expiry');

    if (changed_keys.length === 0) {
      return { ok: true, data: { id: existing.id as string, changed_keys: [] } };
    }

    const { error: updateErr } = await admin
      .from('clients')
      .update(next)
      .eq('id', clientId)
      .eq('tenant_id', tenant.id);

    if (updateErr) {
      console.error('updateClient update failed', updateErr);
      return { ok: false, error: 'Could not update client', code: 'INTERNAL' };
    }

    await admin.from('tenant_audit_log').insert({
      tenant_id: tenant.id,
      actor_id: ctx.caller.id,
      action: 'updated',
      source: 'self_serve',
      details: { entity: 'client', client_id: clientId, op: 'update', changed_keys },
    });

    await recordAuthEvent({
      kind: 'tenant_self_updated',
      actorUserId: ctx.caller.id,
      tenantId: tenant.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { entity: 'client', op: 'edit', changed_keys },
    }).catch((err) => console.error('recordAuthEvent failed', err));

    revalidatePath(`/t/${tenantSlug}/clients`);
    revalidatePath(`/t/${tenantSlug}/clients/${clientId}`);
    return { ok: true, data: { id: existing.id as string, changed_keys } };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('updateClientAction unexpected error', e);
    return { ok: false, error: 'Could not update client', code: 'INTERNAL' };
  }
}
