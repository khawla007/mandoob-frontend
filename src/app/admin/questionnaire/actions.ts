'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import {
  archiveQuestionnaireVersion,
  publishQuestionnaireVersion,
  saveQuestionnaireDraft,
} from '@/lib/questionnaire/definitions';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

const keySchema = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/u);
const titleSchema = z.string().trim().min(1).max(200);
const versionSchema = z.coerce.number().int().nonnegative();
const positiveVersionSchema = z.coerce.number().int().positive();
const uuidSchema = z.string().uuid();

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

export async function saveQuestionnaireDraftAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAal2Admin();
    let definition: unknown;
    try {
      definition = JSON.parse(formString(formData, 'definition'));
    } catch {
      throw new ApiError('INVALID_DEFINITION', 'The definition must be valid JSON.', 400);
    }
    await saveQuestionnaireDraft({
      key: keySchema.parse(formString(formData, 'key')),
      title: titleSchema.parse(formString(formData, 'title')),
      expectedVersion: versionSchema.parse(formString(formData, 'expectedVersion')),
      definition,
    });
    revalidatePath('/admin/questionnaire');
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not save the questionnaire draft');
  }
}

export async function publishQuestionnaireVersionAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAal2Admin();
    await publishQuestionnaireVersion({
      definitionId: uuidSchema.parse(formString(formData, 'definitionId')),
      version: positiveVersionSchema.parse(formString(formData, 'version')),
      expectedVersion: positiveVersionSchema.parse(formString(formData, 'expectedVersion')),
    });
    revalidatePath('/admin/questionnaire');
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not publish the questionnaire version');
  }
}

export async function archiveQuestionnaireVersionAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAal2Admin();
    await archiveQuestionnaireVersion({
      definitionId: uuidSchema.parse(formString(formData, 'definitionId')),
      version: positiveVersionSchema.parse(formString(formData, 'version')),
      expectedVersion: positiveVersionSchema.parse(formString(formData, 'expectedVersion')),
    });
    revalidatePath('/admin/questionnaire');
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not archive the questionnaire version');
  }
}
