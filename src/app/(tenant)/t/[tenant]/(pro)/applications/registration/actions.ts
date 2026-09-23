'use server';

import { revalidatePath } from 'next/cache';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  cancelVisaPerson,
  createRegistration,
  createVisaPerson,
  linkStageDocument,
  transitionStage,
  transitionVisaPerson,
  unlinkStageDocument,
} from '@/lib/data/registration-workflow';
import type {
  CancelVisaPersonInput,
  CreateRegistrationInput,
  CreateVisaPersonInput,
  LinkStageDocumentInput,
  TransitionStageInput,
  TransitionVisaPersonInput,
  UnlinkStageDocumentInput,
} from '@/lib/validation/registration-workflow';
import {
  runCancelVisaPersonAction,
  runCreateRegistrationAction,
  runCreateVisaPersonAction,
  runLinkStageDocumentAction,
  runTransitionStageAction,
  runTransitionVisaPersonAction,
  runUnlinkStageDocumentAction,
  type RegistrationActionDependencies,
  type RegistrationActionResult,
} from './action-logic';

export type { RegistrationActionResult } from './action-logic';

function dependencies(): RegistrationActionDependencies {
  return {
    requirePro: async (slug) => {
      const { session, tenant } = await requireProTenantRouteAccess(slug);
      return { id: session.id, role: session.role, tenantId: tenant.id };
    },
    resolveTenant: resolveTenantBySlug,
    requireActive: requireActiveTenant,
    resolveAssignedCompany: readAssignedCompanyForPro,
    createRegistration,
    transitionStage,
    linkStageDocument,
    unlinkStageDocument,
    createVisaPerson,
    transitionVisaPerson,
    cancelVisaPerson,
    revalidate: revalidatePath,
  };
}

export async function createRegistrationAction(
  slug: string,
  input: CreateRegistrationInput,
): Promise<RegistrationActionResult<Awaited<ReturnType<typeof createRegistration>>>> {
  return runCreateRegistrationAction(slug, input, dependencies());
}

export async function transitionStageAction(
  slug: string,
  input: TransitionStageInput,
): Promise<RegistrationActionResult<Awaited<ReturnType<typeof transitionStage>>>> {
  return runTransitionStageAction(slug, input, dependencies());
}

export async function linkStageDocumentAction(
  slug: string,
  input: LinkStageDocumentInput,
): Promise<RegistrationActionResult<Awaited<ReturnType<typeof linkStageDocument>>>> {
  return runLinkStageDocumentAction(slug, input, dependencies());
}

export async function unlinkStageDocumentAction(
  slug: string,
  input: UnlinkStageDocumentInput,
): Promise<RegistrationActionResult<Awaited<ReturnType<typeof unlinkStageDocument>>>> {
  return runUnlinkStageDocumentAction(slug, input, dependencies());
}

export async function createVisaPersonAction(
  slug: string,
  input: CreateVisaPersonInput,
): Promise<RegistrationActionResult<Awaited<ReturnType<typeof createVisaPerson>>>> {
  return runCreateVisaPersonAction(slug, input, dependencies());
}

export async function transitionVisaPersonAction(
  slug: string,
  input: TransitionVisaPersonInput,
): Promise<RegistrationActionResult<Awaited<ReturnType<typeof transitionVisaPerson>>>> {
  return runTransitionVisaPersonAction(slug, input, dependencies());
}

export async function cancelVisaPersonAction(
  slug: string,
  input: CancelVisaPersonInput,
): Promise<RegistrationActionResult<Awaited<ReturnType<typeof cancelVisaPerson>>>> {
  return runCancelVisaPersonAction(slug, input, dependencies());
}
