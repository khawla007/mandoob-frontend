'use server';

import 'server-only';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { invokeOnboardingMutation } from '@/lib/company-onboarding/action-mutations';
import { readCompanyOnboarding } from '@/lib/data/company-onboarding';
import { getCompanyById } from '@/lib/data/pro-firms';
import {
  runAdminCompanyOnboardingAction,
  type AdminOnboardingActionDependencies,
  type AdminOnboardingActionKind,
  type OnboardingActionState,
} from './action-logic';

const dependencies: AdminOnboardingActionDependencies = {
  async authorize() {
    const session = await requirePlatformOperator();
    return { actorProfileId: session.id };
  },
  async resolveCompany(companyId) {
    const company = await getCompanyById(companyId);
    return company
      ? {
          companyId: company.id,
          tenantId: company.tenantId,
          tenantSlug: company.tenantSlug,
        }
      : null;
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

async function run(
  kind: AdminOnboardingActionKind,
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return runAdminCompanyOnboardingAction(
    { kind, companyId, previousState, formData },
    dependencies,
  );
}

export async function saveAdminLegalSectionAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('legal', companyId, previousState, formData);
}

export async function saveAdminShareholdersSectionAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('shareholders', companyId, previousState, formData);
}

export async function saveAdminActivitiesSectionAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('activities', companyId, previousState, formData);
}

export async function saveAdminOfficeSectionAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('office', companyId, previousState, formData);
}

export async function saveAdminEstablishmentSectionAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('establishment', companyId, previousState, formData);
}

export async function saveAdminBankSectionAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('bank', companyId, previousState, formData);
}

export async function clearAdminBankIdentifierAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('clearBankIdentifier', companyId, previousState, formData);
}

export async function reopenAdminOnboardingSectionAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('reopen', companyId, previousState, formData);
}

export async function submitAdminCompanyOnboardingAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('submit', companyId, previousState, formData);
}

export async function activateAdminCompanyOnboardingAction(
  companyId: string,
  previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  return run('activate', companyId, previousState, formData);
}
