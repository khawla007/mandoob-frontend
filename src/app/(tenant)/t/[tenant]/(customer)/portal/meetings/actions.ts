'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { readSelfCustomer } from '@/lib/data/account-self';
import type { MeetingActor } from '@/lib/data/meetings';
import { createMeetingCommands } from '@/lib/meetings/commands';
import { createDailyRoom } from '@/lib/meetings/daily';
import { createMeetingCollaborationCommands } from '@/lib/meetings/collaboration';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';

export type CustomerMeetingActionResult = { ok: true } | { ok: false; error: string; code: string };

async function resolveCustomerActor(slug: string): Promise<{
  tenantId: string;
  companyId: string | null;
  actor: MeetingActor;
}> {
  const session = await requireRole('customer');
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);
  const customer = await readSelfCustomer();
  return {
    tenantId: tenant.id,
    companyId: customer.linkedCompanyId,
    actor: { id: session.id, role: 'customer', tenantId: tenant.id },
  };
}

function toResult(error: unknown, fallback: string): CustomerMeetingActionResult {
  if (error instanceof ApiError) return { ok: false, error: error.message, code: error.code };
  console.error(fallback, error);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

export async function bookMeetingSlotAction(
  slug: string,
  slotId: string,
  expectedVersion: number,
  operationId: string,
): Promise<CustomerMeetingActionResult> {
  try {
    const { tenantId, companyId, actor } = await resolveCustomerActor(slug);
    if (!companyId) throw new ApiError('FORBIDDEN', 'Company is not available', 403);
    const admin = createSupabaseServiceRoleClient();
    const receipt = await createMeetingCommands(admin).book({
      actorId: actor.id,
      operationId,
      tenantId,
      companyId,
      slotId,
      expectedVersion,
      title: 'Consultation',
    });
    if (receipt.roomState !== 'ready') {
      const { data: meeting, error: meetingError } = await admin
        .from('meetings')
        .select('scheduled_at, duration_minutes')
        .eq('id', receipt.meetingId)
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .single();
      if (meetingError || !meeting) {
        throw new ApiError('MEETING_UNAVAILABLE', 'Meeting is not available.', 404);
      }
      try {
        const room = await createDailyRoom({
          meetingId: receipt.meetingId,
          startsAt: meeting.scheduled_at,
          durationMinutes: meeting.duration_minutes,
        });
        const { error } = await admin
          .from('meetings')
          .update({
            provider_room_name: room.name,
            meeting_url: room.url,
            room_state: 'ready',
          })
          .eq('id', receipt.meetingId)
          .eq('version', receipt.version);
        if (error) throw error;
      } catch (error) {
        await admin
          .from('meetings')
          .update({ room_state: 'compensation_pending' })
          .eq('id', receipt.meetingId)
          .eq('version', receipt.version);
        throw error;
      }
    }
    revalidatePath(`/t/${slug}/portal/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not book meeting');
  }
}

export async function setCustomerMeetingConsentAction(
  slug: string,
  meetingId: string,
  granted: boolean,
): Promise<CustomerMeetingActionResult> {
  try {
    const { actor } = await resolveCustomerActor(slug);
    await createMeetingCollaborationCommands(createSupabaseServiceRoleClient()).setConsent({
      actorId: actor.id,
      meetingId,
      granted,
      policyVersion: 'p3.11-v1',
    });
    revalidatePath(`/t/${slug}/portal/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not update meeting consent');
  }
}
