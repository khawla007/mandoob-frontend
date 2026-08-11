'use server';

import { revalidatePath } from 'next/cache';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireRole } from '@/lib/auth/require-role';
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
    requirePro: async () => {
      const session = await requireRole('pro');
      return { id: session.id, tenantId: session.tenantId };
    },
    resolveTenant: resolveTenantBySlug,
    requireActive: requireActiveTenant,
    createCase: createServiceCase,
    updateCase: updateServiceCase,
    revalidate: revalidatePath,
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
