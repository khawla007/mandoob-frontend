'use server';

import { revalidatePath } from 'next/cache';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { createServiceCase, updateServiceCase } from '@/lib/data/service-cases';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  runCreateApplicationAction,
  runUpdateApplicationAction,
  type ApplicationActionDependencies,
  type ApplicationActionResult,
} from './action-logic';

export type { ApplicationActionResult } from './action-logic';

function dependencies(): ApplicationActionDependencies {
  return {
    requirePro: async (slug) => {
      const { session, tenant } = await requireProTenantRouteAccess(slug);
      return { id: session.id, role: session.role, tenantId: tenant.id };
    },
    resolveTenant: resolveTenantBySlug,
    requireActive: requireActiveTenant,
    createCase: createServiceCase,
    updateCase: updateServiceCase,
    revalidate: revalidatePath,
    now: () => new Date(),
  };
}

export async function createApplicationAction(
  slug: string,
  raw: unknown,
): Promise<ApplicationActionResult<{ id: string }>> {
  return runCreateApplicationAction(slug, raw, dependencies());
}

export async function updateApplicationAction(
  slug: string,
  caseId: string,
  raw: unknown,
): Promise<ApplicationActionResult<void>> {
  return runUpdateApplicationAction(slug, caseId, raw, dependencies());
}

export async function createApplicationFormAction(
  slug: string,
  _previous: ApplicationActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ApplicationActionResult<{ id: string }>> {
  return createApplicationAction(slug, formData);
}

export async function updateApplicationFormAction(
  slug: string,
  caseId: string,
  _previous: ApplicationActionResult<void> | null,
  formData: FormData,
): Promise<ApplicationActionResult<void>> {
  return updateApplicationAction(slug, caseId, formData);
}
