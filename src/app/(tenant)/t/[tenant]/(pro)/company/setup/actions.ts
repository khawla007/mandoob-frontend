'use server';

import 'server-only';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { invokeOnboardingMutation } from '@/lib/company-onboarding/action-mutations';
import { readCompanyOnboarding } from '@/lib/data/company-onboarding';
import {
  runProCompanyOnboardingAction,
  type OnboardingActionKind,
  type OnboardingActionState,
  type ProOnboardingActionDependencies,
} from './action-logic';

function dependencies(): ProOnboardingActionDependencies {
  return {
    async authorize(tenantSlug) {
      const { session, tenant } = await requireProTenantRouteAccess(tenantSlug);
      return { actorProfileId: session.id, tenantId: tenant.id, tenantSlug: tenant.slug };
    },
    read: readCompanyOnboarding,
    mutate: invokeOnboardingMutation,
    createOperationId: randomUUID,
    revalidate: revalidatePath,
    redirect,
    reportError(event) {
      console.error(event);
    },
  };
}

async function run(
  kind: OnboardingActionKind,
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return runProCompanyOnboardingAction(
    { kind, tenantSlug, companyId, previousState, formData },
    dependencies(),
  );
}

export async function saveLegalSectionAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('legal', tenantSlug, companyId, previousState, formData);
}

export async function saveShareholdersSectionAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('shareholders', tenantSlug, companyId, previousState, formData);
}

export async function saveActivitiesSectionAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('activities', tenantSlug, companyId, previousState, formData);
}

export async function saveOfficeSectionAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('office', tenantSlug, companyId, previousState, formData);
}

export async function saveEstablishmentSectionAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('establishment', tenantSlug, companyId, previousState, formData);
}

export async function saveBankSectionAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('bank', tenantSlug, companyId, previousState, formData);
}

export async function clearBankIdentifierAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('clearBankIdentifier', tenantSlug, companyId, previousState, formData);
}

export async function reopenOnboardingSectionAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('reopen', tenantSlug, companyId, previousState, formData);
}

export async function submitCompanyOnboardingAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('submit', tenantSlug, companyId, previousState, formData);
}

export async function activateCompanyOnboardingAction(
  tenantSlug: string,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('activate', tenantSlug, companyId, previousState, formData);
}
