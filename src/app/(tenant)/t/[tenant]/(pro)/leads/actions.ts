'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  addLeadNote,
  LEAD_STAGES,
  setLeadStage,
  type LeadStage,
} from '@/lib/data/leads-kanban';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

const idSchema = z.string().min(1);
const stageSchema = z.enum(LEAD_STAGES);
const noteSchema = z.string().trim().min(1).max(2000);

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function resolveAndAuthorize(slug: string) {
  const session = await requireRole('pro');
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);
  return { tenant, session };
}

function toResult(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  console.error(fallback, e);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

export async function setProLeadStageAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { tenant, session } = await resolveAndAuthorize(slug);
    const leadId = idSchema.parse(formString(formData, 'leadId'));
    const stage = stageSchema.parse(formString(formData, 'stage')) as LeadStage;
    await setLeadStage(leadId, stage, {
      id: session.id,
      role: 'pro',
      tenantId: tenant.id,
    });
    revalidatePath(`/t/${slug}/leads`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not update lead stage');
  }
}

export async function addProLeadNoteAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { tenant, session } = await resolveAndAuthorize(slug);
    const leadId = idSchema.parse(formString(formData, 'leadId'));
    const note = noteSchema.parse(formString(formData, 'note'));
    await addLeadNote(leadId, note, {
      id: session.id,
      role: 'pro',
      tenantId: tenant.id,
    });
    revalidatePath(`/t/${slug}/leads`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not add lead note');
  }
}
