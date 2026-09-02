'use server';

import 'server-only';
import { ApiError } from '@/lib/errors';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';

export const BILLING_ACTIONS_UNAVAILABLE = 'BILLING_ACTIONS_UNAVAILABLE';

export type BillingActionResult = {
  ok: false;
  code: 'BILLING_ACTIONS_UNAVAILABLE';
  errorKey: 'billingActionsUnavailable';
};

async function authorizeBillingAction(slug: string): Promise<void> {
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, tenant.slug);
  if (!company || company.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'No active company assignment', 403);
  }
}

function unavailable(): BillingActionResult {
  return { ok: false, code: 'BILLING_ACTIONS_UNAVAILABLE', errorKey: 'billingActionsUnavailable' };
}

export async function startCheckoutAction(formData: FormData): Promise<BillingActionResult> {
  await authorizeBillingAction(String(formData.get('tenantSlug') ?? ''));
  return unavailable();
}

export async function openBillingPortalAction(formData: FormData): Promise<BillingActionResult> {
  await authorizeBillingAction(String(formData.get('tenantSlug') ?? ''));
  return unavailable();
}

export async function cancelSubscriptionAction(formData: FormData): Promise<BillingActionResult> {
  await authorizeBillingAction(String(formData.get('tenantSlug') ?? ''));
  return unavailable();
}
