'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { LEAD_STAGES, mutatePlatformLead } from '@/lib/data/leads-kanban';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

const uuidSchema = z.string().uuid();
const versionSchema = z.coerce.number().int().positive();
const stageSchema = z.enum(LEAD_STAGES);
const noteSchema = z.string().trim().min(1).max(2000);

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAal2Admin() {
  const session = await requireRole('super_admin', 'admin');
  if (session.aal !== 'aal2') throw new ApiError('AAL2_REQUIRED', 'MFA challenge required', 403);
  return session;
}

function toResult(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  console.error(fallback, e);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

async function runMutation(
  formData: FormData,
  action: 'assign' | 'stage' | 'note',
  value: string,
): Promise<ActionResult> {
  await requireAal2Admin();
  await mutatePlatformLead({
    leadId: uuidSchema.parse(formString(formData, 'leadId')),
    operationId: uuidSchema.parse(formString(formData, 'operationId')),
    expectedVersion: versionSchema.parse(formString(formData, 'expectedVersion')),
    action,
    value,
  });
  revalidatePath('/admin/leads');
  return { ok: true, data: undefined };
}

export async function assignLeadAction(formData: FormData): Promise<ActionResult> {
  try {
    return await runMutation(
      formData,
      'assign',
      uuidSchema.parse(formString(formData, 'tenantId')),
    );
  } catch (e) {
    return toResult(e, 'Could not assign lead');
  }
}

export async function setAdminLeadStageAction(formData: FormData): Promise<ActionResult> {
  try {
    return await runMutation(formData, 'stage', stageSchema.parse(formString(formData, 'stage')));
  } catch (e) {
    return toResult(e, 'Could not update lead stage');
  }
}

export async function addAdminLeadNoteAction(formData: FormData): Promise<ActionResult> {
  try {
    return await runMutation(formData, 'note', noteSchema.parse(formString(formData, 'note')));
  } catch (e) {
    return toResult(e, 'Could not add lead note');
  }
}
