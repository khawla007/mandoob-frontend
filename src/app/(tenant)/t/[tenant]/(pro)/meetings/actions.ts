'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import type { MeetingActor } from '@/lib/data/meetings';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { createMeetingCommands } from '@/lib/meetings/commands';
import { createMeetingCollaborationCommands } from '@/lib/meetings/collaboration';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { randomUUID } from 'node:crypto';
import { dubaiLocalToIso } from '@/lib/meetings/contracts';

export type MeetingActionResult = { ok: true } | { ok: false; error: string; code: string };

async function resolveActor(
  slug: string,
): Promise<{ tenantId: string; companyId: string; actor: MeetingActor }> {
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Assigned Company is not available', 403);
  }
  return {
    tenantId: tenant.id,
    companyId: company.id,
    actor: { id: session.id, role: session.role, tenantId: tenant.id },
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
    if (timezone !== 'Asia/Dubai' || durationMinutes < 15 || durationMinutes > 180) {
      return { ok: false, error: 'Choose a valid Dubai meeting time.', code: 'INVALID_INPUT' };
    }
    const startsIso = dubaiLocalToIso(startsAt);
    const endsIso = new Date(new Date(startsIso).getTime() + durationMinutes * 60000).toISOString();
    const operationId = String(formData.get('operation_id') ?? '');
    const { tenantId, companyId, actor } = await resolveActor(slug);
    await createMeetingCommands(createSupabaseServiceRoleClient()).createSlot({
      actorId: actor.id,
      operationId,
      tenantId,
      companyId,
      startsAt: startsIso,
      endsAt: endsIso,
    });
    revalidatePath(`/t/${slug}/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not create meeting slot');
  }
}

export async function rescheduleMeetingAction(
  slug: string,
  meetingId: string,
  expectedVersion: number,
  operationId: string,
  formData: FormData,
): Promise<MeetingActionResult> {
  try {
    const startsAt = dubaiLocalToIso(String(formData.get('starts_at') ?? ''));
    const duration = Number(formData.get('duration_minutes') ?? 30);
    if (!Number.isInteger(duration) || duration < 15 || duration > 180) {
      throw new ApiError('INVALID_INPUT', 'Choose a valid meeting duration.', 400);
    }
    const endsAt = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();
    const { actor } = await resolveActor(slug);
    await createMeetingCommands(createSupabaseServiceRoleClient()).reschedule({
      actorId: actor.id,
      operationId,
      meetingId,
      expectedVersion,
      startsAt,
      endsAt,
    });
    revalidatePath(`/t/${slug}/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not reschedule meeting');
  }
}

export async function cancelMeetingAction(
  slug: string,
  meetingId: string,
  expectedVersion: number,
  operationId: string,
): Promise<MeetingActionResult> {
  try {
    const { actor } = await resolveActor(slug);
    await createMeetingCommands(createSupabaseServiceRoleClient()).cancel({
      actorId: actor.id,
      operationId,
      meetingId,
      expectedVersion,
    });
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
    const { data, error } = await createSupabaseServiceRoleClient().rpc(
      'p311_request_ai_processing',
      { p_meeting_id: meetingId, p_operation_id: randomUUID(), p_actor_id: actor.id },
    );
    if (error || data !== true) {
      throw new ApiError('CONSENT_REQUIRED', 'All participants must grant consent first.', 409);
    }
    revalidatePath(`/t/${slug}/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not retry meeting summary');
  }
}

export async function setProMeetingConsentAction(
  slug: string,
  meetingId: string,
  granted: boolean,
): Promise<MeetingActionResult> {
  try {
    const { actor } = await resolveActor(slug);
    await createMeetingCollaborationCommands(createSupabaseServiceRoleClient()).setConsent({
      actorId: actor.id,
      meetingId,
      granted,
      policyVersion: 'p3.11-v1',
    });
    revalidatePath(`/t/${slug}/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not update meeting consent');
  }
}

export async function addMeetingNoteAction(
  slug: string,
  meetingId: string,
  formData: FormData,
): Promise<MeetingActionResult> {
  try {
    const { actor } = await resolveActor(slug);
    await createMeetingCollaborationCommands(createSupabaseServiceRoleClient()).addNote({
      actorId: actor.id,
      meetingId,
      body: String(formData.get('body') ?? ''),
      visibility: 'participants',
    });
    revalidatePath(`/t/${slug}/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not add meeting note');
  }
}

export async function reviewMeetingActionItemAction(
  slug: string,
  meetingId: string,
  actionItemId: string,
  decision: 'accepted' | 'dismissed',
): Promise<MeetingActionResult> {
  try {
    const { actor } = await resolveActor(slug);
    await createMeetingCollaborationCommands(createSupabaseServiceRoleClient()).reviewAction({
      actorId: actor.id,
      meetingId,
      actionItemId,
      decision,
    });
    revalidatePath(`/t/${slug}/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not review action item');
  }
}
