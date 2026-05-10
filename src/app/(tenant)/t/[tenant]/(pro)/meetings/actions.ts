'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { cancelMeeting, createMeetingSlot, type MeetingActor } from '@/lib/data/meetings';
import { retryMeetingAiSummary } from '@/lib/data/meeting-ai-summaries';

export type MeetingActionResult =
  | { ok: true }
  | { ok: false; error: string; code: string };

async function resolveActor(slug: string): Promise<{ tenantId: string; actor: MeetingActor }> {
  const session = await requireRole('pro');
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);
  return {
    tenantId: tenant.id,
    actor: { id: session.id, role: 'pro', tenantId: tenant.id },
  };
}

function toResult(error: unknown, fallback: string): MeetingActionResult {
  if (error instanceof ApiError) return { ok: false, error: error.message, code: error.code };
  console.error(fallback, error);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

export async function createMeetingSlotAction(
  slug: string,
  formData: FormData,
): Promise<MeetingActionResult> {
  try {
    const startsAt = String(formData.get('starts_at') ?? '');
    const durationMinutes = Number(formData.get('duration_minutes') ?? 30);
    const timezone = String(formData.get('timezone') ?? 'Asia/Dubai') || 'Asia/Dubai';
    const starts = new Date(startsAt);
    if (!Number.isFinite(starts.getTime())) {
      return { ok: false, error: 'Choose a valid start time.', code: 'INVALID_INPUT' };
    }
    const ends = new Date(starts.getTime() + Math.max(15, durationMinutes) * 60000);
    const { tenantId, actor } = await resolveActor(slug);
    await createMeetingSlot(
      {
        tenantId,
        startsAt: starts.toISOString(),
        endsAt: ends.toISOString(),
        timezone,
      },
      actor,
    );
    revalidatePath(`/t/${slug}/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not create meeting slot');
  }
}

export async function cancelMeetingAction(
  slug: string,
  meetingId: string,
): Promise<MeetingActionResult> {
  try {
    const { actor } = await resolveActor(slug);
    await cancelMeeting(meetingId, actor);
    revalidatePath(`/t/${slug}/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not cancel meeting');
  }
}

export async function retryMeetingSummaryAction(
  slug: string,
  meetingId: string,
): Promise<MeetingActionResult> {
  try {
    const { actor } = await resolveActor(slug);
    await retryMeetingAiSummary(meetingId, actor);
    revalidatePath(`/t/${slug}/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not retry meeting summary');
  }
}
