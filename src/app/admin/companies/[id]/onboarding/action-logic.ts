import {
  createActionState,
  runOnboardingAction,
  type OnboardingActionKind,
  type OnboardingActionState,
  type OnboardingCoreDependencies,
} from '@/lib/company-onboarding/action-orchestration';

export type AdminOnboardingActionKind = OnboardingActionKind;
export type { OnboardingActionState };

export type AdminCompanyScope = {
  companyId: string;
  tenantId: string;
  tenantSlug: string;
};

export type AdminOnboardingActionDependencies = OnboardingCoreDependencies & {
  authorize(): Promise<{ actorProfileId: string }>;
  resolveCompany(companyId: string): Promise<AdminCompanyScope | null>;
};

export type AdminOnboardingActionOptions = {
  kind: AdminOnboardingActionKind;
  companyId: string;
  previousState: OnboardingActionState;
  formData: FormData;
};

export function createAdminOnboardingActionState(
  version: number,
  createOperationId: () => string = crypto.randomUUID,
): OnboardingActionState {
  return createActionState(version, createOperationId);
}

export async function runAdminCompanyOnboardingAction(
  options: AdminOnboardingActionOptions,
  dependencies: AdminOnboardingActionDependencies,
): Promise<OnboardingActionState> {
  const authorization = await dependencies.authorize();
  const company = await dependencies.resolveCompany(options.companyId);
  if (!company || company.companyId !== options.companyId) {
    return {
      status: 'error',
      version: options.previousState.version,
      operationId: dependencies.createOperationId(),
      code: 'COMPANY_NOT_FOUND',
    };
  }

  return runOnboardingAction(
    {
      kind: options.kind,
      scope: {
        actorProfileId: authorization.actorProfileId,
        tenantId: company.tenantId,
        companyId: company.companyId,
      },
      previousState: options.previousState,
      formData: options.formData,
      notFoundCode: 'COMPANY_NOT_FOUND',
      revalidationPaths: [
        `/admin/companies/${company.companyId}/onboarding`,
        `/admin/companies/${company.companyId}`,
        '/admin/companies',
      ],
      ...(options.kind === 'submit' || options.kind === 'activate'
        ? { successRedirect: `/admin/companies/${company.companyId}` }
        : {}),
    },
    dependencies,
  );
}
