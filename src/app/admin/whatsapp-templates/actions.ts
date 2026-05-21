'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import {
  updateWhatsAppTemplateApproval,
  WHATSAPP_TEMPLATE_APPROVAL_STATUSES,
} from '@/lib/data/whatsapp-template-approvals';
import type { WhatsAppTemplateId } from '@/lib/whatsapp/templates';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

const templateIdSchema = z.string().trim().min(1);
const optionalTenantIdSchema = z
  .string()
  .trim()
  .transform((value) => (value ? value : null))
  .pipe(z.string().uuid().nullable());
const statusSchema = z.enum(WHATSAPP_TEMPLATE_APPROVAL_STATUSES);
const optionalTextSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value ? value : null));

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function optionalTimestamp(formData: FormData, key: string): string | null {
  const raw = formString(formData, key).trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError('INVALID_TIMESTAMP', `Invalid ${key} ISO timestamp`, 400);
  }
  return date.toISOString();
}

function toResult(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof z.ZodError) {
    return { ok: false, error: e.issues[0]?.message ?? fallback, code: 'INVALID_INPUT' };
  }
  console.error(fallback, e);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

export async function updateWhatsAppTemplateApprovalAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireRole('super_admin', 'admin');
    const templateId = templateIdSchema.parse(formString(formData, 'templateId')) as WhatsAppTemplateId;
    const tenantId = optionalTenantIdSchema.parse(formString(formData, 'tenantId'));
    const status = statusSchema.parse(formString(formData, 'status'));
    const notes = optionalTextSchema.parse(formString(formData, 'notes'));
    const rejectionReason = optionalTextSchema.parse(formString(formData, 'rejectionReason'));
    const submittedAt = optionalTimestamp(formData, 'submittedAt');
    const lastCheckedAt = optionalTimestamp(formData, 'lastCheckedAt');

    await updateWhatsAppTemplateApproval(
      {
        templateId,
        tenantId,
        status,
        notes,
        rejectionReason,
        submittedAt,
        lastCheckedAt,
      },
      {
        id: session.id,
        role: session.role as 'super_admin' | 'admin',
      },
    );
    revalidatePath('/admin/whatsapp-templates');
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not update WhatsApp template approval');
  }
}
