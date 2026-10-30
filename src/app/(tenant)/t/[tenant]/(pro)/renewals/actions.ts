'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import {
  assignedProActor,
  p308Client,
  p308Failure,
  type P308ActionResult,
} from '@/lib/p308/server';
import {
  batchTransitionRenewals,
  createRenewal,
  transitionRenewal,
  updateRenewal,
  type RenewalReceipt,
} from '@/lib/renewals/commands';
import {
  batchTransitionRenewalSchema,
  createRenewalActionSchema,
  transitionRenewalSchema,
  updateRenewalSchema,
} from '@/lib/validation/renewal';

export type ActionResult<T = void> = P308ActionResult<T>;

function revalidateRenewalRoutes(slug: string) {
  revalidatePath(`/t/${slug}/renewals`);
  revalidatePath(`/t/${slug}/company`);
  revalidatePath(`/t/${slug}/dashboard`);
}

async function actor(slug: string) {
  return assignedProActor(await requireProTenantRouteAccess(slug), slug);
}

function invalid(): ActionResult<never> {
  return {
    ok: false,
    code: 'VALIDATION_FAILED',
    error: 'Check the highlighted values and try again.',
  };
}

export async function createRenewalAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<RenewalReceipt>> {
  const parsed = createRenewalActionSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  try {
    const resolved = await actor(slug);
    const receipt = await createRenewal(p308Client(), resolved, parsed.data);
    revalidateRenewalRoutes(slug);
    return { ok: true, data: receipt };
  } catch (error) {
    return p308Failure('renewal.create', error);
  }
}

export async function updateRenewalAction(
  slug: string,
  renewalId: string,
  raw: unknown,
): Promise<ActionResult<RenewalReceipt>> {
  const parsed = updateRenewalSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  try {
    const resolved = await actor(slug);
    const receipt = await updateRenewal(p308Client(), resolved, renewalId, parsed.data);
    revalidateRenewalRoutes(slug);
    return { ok: true, data: receipt };
  } catch (error) {
    return p308Failure('renewal.update', error);
  }
}

export async function transitionRenewalAction(
  slug: string,
  renewalId: string,
  raw: unknown,
): Promise<ActionResult<RenewalReceipt>> {
  const parsed = transitionRenewalSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  try {
    const resolved = await actor(slug);
    const receipt = await transitionRenewal(p308Client(), resolved, renewalId, parsed.data);
    revalidateRenewalRoutes(slug);
    return { ok: true, data: receipt };
  } catch (error) {
    return p308Failure('renewal.transition', error);
  }
}

/** Completion is the guarded `government_processing → completed` transition with evidence. */
export async function completeRenewalAction(
  slug: string,
  renewalId: string,
  raw: unknown,
): Promise<ActionResult<RenewalReceipt>> {
  return transitionRenewalAction(slug, renewalId, {
    ...(raw as Record<string, unknown>),
    to_stage: 'completed',
  });
}

/** Cancellation requires a reason code; licence-synced rows stay locked. */
export async function cancelRenewalAction(
  slug: string,
  renewalId: string,
  raw: unknown,
): Promise<ActionResult<RenewalReceipt>> {
  return transitionRenewalAction(slug, renewalId, {
    ...(raw as Record<string, unknown>),
    to_stage: 'cancelled',
  });
}

export async function batchTransitionRenewalsAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = batchTransitionRenewalSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  try {
    const resolved = await actor(slug);
    const result = await batchTransitionRenewals(p308Client(), resolved, parsed.data);
    revalidateRenewalRoutes(slug);
    return { ok: true, data: { count: result.count } };
  } catch (error) {
    return p308Failure('renewal.batch', error);
  }
}
