'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  inviteColleagueSchema,
  changeMemberRoleSchema,
  setMemberStatusSchema,
  resendInviteSchema,
} from '@/lib/validation/tenant-team';
import {
  inviteColleague,
  changeMemberRole,
  setMemberStatus,
  resendMemberInvite,
} from '@/lib/data/tenant-team';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

async function resolveAdminCtx(slug: string) {
  const session = await requireRole('admin', 'super_admin');
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (session.role !== 'super_admin' && session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);
  const hdr = await headers();
  const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = hdr.get('user-agent') ?? null;
  return {
    caller: { id: session.id, role: session.role!, tenantId: session.tenantId },
    ip,
    userAgent,
    tenantId: tenant.id,
    slug,
  };
}

function failure(e: unknown): { ok: false; error: string; code: string } {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  console.error('team action unexpected error', e);
  return { ok: false, error: 'Unexpected error', code: 'INTERNAL' };
}

export async function inviteColleagueAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<{ userId: string }>> {
  try {
    const ctx = await resolveAdminCtx(slug);
    const input = inviteColleagueSchema.parse(raw);
    const data = await inviteColleague(input, ctx);
    revalidatePath(`/t/${slug}/team`);
    return { ok: true, data };
  } catch (e) {
    return failure(e);
  }
}

export async function changeMemberRoleAction(slug: string, raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await resolveAdminCtx(slug);
    const input = changeMemberRoleSchema.parse(raw);
    await changeMemberRole(input, ctx);
    revalidatePath(`/t/${slug}/team`);
    return { ok: true, data: undefined };
  } catch (e) {
    return failure(e);
  }
}

export async function setMemberStatusAction(slug: string, raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await resolveAdminCtx(slug);
    const input = setMemberStatusSchema.parse(raw);
    await setMemberStatus(input, ctx);
    revalidatePath(`/t/${slug}/team`);
    return { ok: true, data: undefined };
  } catch (e) {
    return failure(e);
  }
}

export async function resendMemberInviteAction(slug: string, raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await resolveAdminCtx(slug);
    const input = resendInviteSchema.parse(raw);
    await resendMemberInvite(input, ctx);
    revalidatePath(`/t/${slug}/team`);
    return { ok: true, data: undefined };
  } catch (e) {
    return failure(e);
  }
}
