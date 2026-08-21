import {
  createActionState,
  runOnboardingAction,
  type OnboardingActionKind,
  type OnboardingActionState,
  type OnboardingCoreDependencies,
} from '@/lib/company-onboarding/action-orchestration';
import type { CompanyOnboardingSectionKey } from '@/lib/company-onboarding/contracts';
import { companyOnboardingSectionHref, nextCompanyOnboardingSection } from './route-logic';

export type { OnboardingActionKind, OnboardingActionState };

export type ProOnboardingAuthorization = {
  actorProfileId: string;
  tenantId: string;
  tenantSlug: string;
};

export type ProOnboardingActionDependencies = OnboardingCoreDependencies & {
  authorize(tenantSlug: string): Promise<ProOnboardingAuthorization>;
};

export type ProOnboardingActionOptions = {
  kind: OnboardingActionKind;
  tenantSlug: string;
  companyId: string;
  previousState: OnboardingActionState;
  formData: FormData;
};

export function createOnboardingActionState(
  version: number,
  createOperationId: () => string = crypto.randomUUID,
): OnboardingActionState {
  return createActionState(version, createOperationId);
}

export async function runProCompanyOnboardingAction(
  options: ProOnboardingActionOptions,
  dependencies: ProOnboardingActionDependencies,
): Promise<OnboardingActionState> {
  const authorization = await dependencies.authorize(options.tenantSlug);
  if (authorization.tenantSlug !== options.tenantSlug) {
    return {
      status: 'error',
      version: options.previousState.version,
      operationId: dependencies.createOperationId(),
      code: 'ASSIGNMENT_NOT_FOUND',
    };
  }

  const sectionKinds: CompanyOnboardingSectionKey[] = [
    'legal',
    'shareholders',
    'activities',
    'office',
    'establishment',
    'bank',
  ];
  const continueSection =
    options.formData.get('intent') === 'continue' &&
    sectionKinds.includes(options.kind as CompanyOnboardingSectionKey)
      ? (options.kind as CompanyOnboardingSectionKey)
      : null;

  return runOnboardingAction(
    {
      kind: options.kind,
      scope: {
        actorProfileId: authorization.actorProfileId,
        tenantId: authorization.tenantId,
        companyId: options.companyId,
      },
      previousState: options.previousState,
      formData: options.formData,
      notFoundCode: 'ASSIGNMENT_NOT_FOUND',
      revalidationPaths: [
        `/t/${authorization.tenantSlug}/company/setup`,
        `/t/${authorization.tenantSlug}/company`,
        `/t/${authorization.tenantSlug}/dashboard`,
      ],
      ...(options.kind === 'submit' || options.kind === 'activate'
        ? { successRedirect: `/t/${authorization.tenantSlug}/company` }
        : continueSection
          ? {
              successRedirect: companyOnboardingSectionHref(
                authorization.tenantSlug,
                nextCompanyOnboardingSection(continueSection),
              ),
            }
          : {}),
    },
    dependencies,
  );
}
