'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { readSelfProfile } from '@/lib/data/account-self';
import { createErasureRequest } from '@/lib/data/erasure';

export type ActionResult =
  | { ok: true; data: { requestId: string } }
  | { ok: false; error: string; code: string };

const schema = z.object({
  recoveryEmail: z.string().trim().email().max(320),
  reason: z.string().trim().max(1000).optional(),
});

function toResult(e: unknown): ActionResult {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  console.error('requestErasureAction failed', e);
  return { ok: false, error: 'Could not submit erasure request', code: 'INTERNAL' };
}

export async function requestErasureAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireRole('customer');
    if (!session.tenantId) {
      throw new ApiError('FORBIDDEN', 'Session missing tenant binding', 403);
    }
    const tenant = await resolveTenantBySlug(slug);
    if (!tenant || tenant.id !== session.tenantId) {
      throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
    }
    const parsed = schema.parse({
      recoveryEmail: formData.get('recoveryEmail'),
      reason: formData.get('reason') || undefined,
    });
    const hdr = await headers();
    const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const profile = await readSelfProfile();
    const result = await createErasureRequest({
      subjectKind: 'customer',
      subjectUserId: session.id,
      subjectTenantId: tenant.id,
      tenantSlug: tenant.slug,
      subjectName: profile.fullName,
      subjectEmail: session.email,
      recoveryEmail: parsed.recoveryEmail,
      reason: parsed.reason ?? null,
      ip,
    });
    revalidatePath(`/t/${tenant.slug}/portal/account/erasure`);
    return { ok: true, data: result };
  } catch (e) {
    return toResult(e);
  }
}
