'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { readSelfCustomer } from '@/lib/data/account-self';
import { bookMeetingSlot, type MeetingActor } from '@/lib/data/meetings';
import { resolveTenantBySlug } from '@/lib/data/tenant';

export type CustomerMeetingActionResult =
  | { ok: true }
  | { ok: false; error: string; code: string };

async function resolveCustomerActor(slug: string): Promise<{
  tenantId: string;
  clientId: string | null;
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
    clientId: customer.linkedClientId,
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
): Promise<CustomerMeetingActionResult> {
  try {
    const { tenantId, clientId, actor } = await resolveCustomerActor(slug);
    await bookMeetingSlot(
      slotId,
      {
        tenantId,
        customerProfileId: actor.id,
        clientId,
        title: 'Consultation',
      },
      actor,
    );
    revalidatePath(`/t/${slug}/portal/meetings`);
    return { ok: true };
  } catch (error) {
    return toResult(error, 'Could not book meeting');
  }
}
