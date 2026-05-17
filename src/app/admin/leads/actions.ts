'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import {
  addLeadNote,
  assignLeadToTenant,
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

function toResult(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  console.error(fallback, e);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

export async function assignLeadAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole('super_admin', 'admin');
    const leadId = idSchema.parse(formString(formData, 'leadId'));
    const tenantId = idSchema.parse(formString(formData, 'tenantId'));
    await assignLeadToTenant(leadId, tenantId, session.id);
    revalidatePath('/admin/leads');
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not assign lead');
  }
}

export async function setAdminLeadStageAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole('super_admin', 'admin');
    const leadId = idSchema.parse(formString(formData, 'leadId'));
    const stage = stageSchema.parse(formString(formData, 'stage')) as LeadStage;
    await setLeadStage(leadId, stage, {
      id: session.id,
      role: session.role as 'super_admin' | 'admin',
      tenantId: session.tenantId,
    });
    revalidatePath('/admin/leads');
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not update lead stage');
  }
}

export async function addAdminLeadNoteAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole('super_admin', 'admin');
    const leadId = idSchema.parse(formString(formData, 'leadId'));
    const note = noteSchema.parse(formString(formData, 'note'));
    await addLeadNote(leadId, note, {
      id: session.id,
      role: session.role as 'super_admin' | 'admin',
      tenantId: session.tenantId,
    });
    revalidatePath('/admin/leads');
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not add lead note');
  }
}
