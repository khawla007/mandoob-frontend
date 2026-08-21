import 'server-only';

import type {
  OnboardingActionKind,
  OnboardingMutationInput,
} from '@/lib/company-onboarding/action-orchestration';
import {
  activateCompanyOnboarding,
  clearCompanyBankIdentifier,
  reopenCompanyOnboardingSection,
  saveCompanyActivitiesSection,
  saveCompanyBankSection,
  saveCompanyEstablishmentSection,
  saveCompanyLegalSection,
  saveCompanyOfficeSection,
  saveCompanyShareholdersSection,
  submitCompanyOnboarding,
  type OnboardingMutationResult,
} from '@/lib/data/company-onboarding-mutations';

export async function invokeOnboardingMutation(
  kind: OnboardingActionKind,
  input: OnboardingMutationInput,
): Promise<OnboardingMutationResult> {
  switch (kind) {
    case 'legal':
      return saveCompanyLegalSection(input as Parameters<typeof saveCompanyLegalSection>[0]);
    case 'shareholders':
      return saveCompanyShareholdersSection(
        input as Parameters<typeof saveCompanyShareholdersSection>[0],
      );
    case 'activities':
      return saveCompanyActivitiesSection(
        input as Parameters<typeof saveCompanyActivitiesSection>[0],
      );
    case 'office':
      return saveCompanyOfficeSection(input as Parameters<typeof saveCompanyOfficeSection>[0]);
    case 'establishment':
      return saveCompanyEstablishmentSection(
        input as Parameters<typeof saveCompanyEstablishmentSection>[0],
      );
    case 'bank':
      return saveCompanyBankSection(input as Parameters<typeof saveCompanyBankSection>[0]);
    case 'clearBankIdentifier':
      return clearCompanyBankIdentifier(input as Parameters<typeof clearCompanyBankIdentifier>[0]);
    case 'reopen':
      return reopenCompanyOnboardingSection(
        input as Parameters<typeof reopenCompanyOnboardingSection>[0],
      );
    case 'submit':
      return submitCompanyOnboarding(input as Parameters<typeof submitCompanyOnboarding>[0]);
    case 'activate':
      return activateCompanyOnboarding(input as Parameters<typeof activateCompanyOnboarding>[0]);
  }
}
