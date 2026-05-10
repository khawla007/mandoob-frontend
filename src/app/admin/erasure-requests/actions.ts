'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { requireAal2, requireRole } from '@/lib/auth/require-role';
import { executeErasure, rejectErasureRequest } from '@/lib/data/erasure';

export type ActionResult =
  | { ok: true; data: undefined }
  | { ok: false; error: string; code: string };

const idSchema = z.string().uuid();
const rejectionSchema = z.string().trim().min(1).max(1000);

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function toResult(e: unknown, fallback: string): ActionResult {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  console.error(fallback, e);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

export async function approveErasureAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole('super_admin', 'admin');
    await requireAal2(session);
    const requestId = idSchema.parse(field(formData, 'requestId'));
    await executeErasure(requestId, session.id);
    revalidatePath('/admin/erasure-requests');
    revalidatePath(`/admin/erasure-requests/${requestId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not approve erasure request');
  }
}

export async function rejectErasureAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole('super_admin', 'admin');
    await requireAal2(session);
    const requestId = idSchema.parse(field(formData, 'requestId'));
    const reason = rejectionSchema.parse(field(formData, 'rejectionReason'));
    await rejectErasureRequest({ requestId, actorId: session.id, reason });
    revalidatePath('/admin/erasure-requests');
    revalidatePath(`/admin/erasure-requests/${requestId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not reject erasure request');
  }
}
