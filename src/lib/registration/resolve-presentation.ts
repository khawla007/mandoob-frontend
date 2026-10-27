import 'server-only';

import type { RegistrationPresentation, RegistrationSourceState } from './contracts';
import type { RegistrationLoaderContext } from './db-adapter';
import type { ResolveActiveRegistrationRole } from '@/lib/data/registration-workflow';
import type { RegistrationWorkflowDeps } from '@/lib/data/registration-workflow';

const visaUnavailable = { kind: 'unavailable', reason: 'visa_contract_unavailable' } as const;

// Fail-closed sentinel reused across the PRO / customer / employee pages when no
// active registration resolves or the scoped read is unavailable.
export const REGISTRATION_UNAVAILABLE: RegistrationSourceState<RegistrationPresentation> = {
  kind: 'unavailable',
  reason: 'registration_contract_unavailable',
};

export type ResolveScopedPresentationDeps = {
  resolveActiveRegistration(
    context: {
      role: ResolveActiveRegistrationRole;
      actorId: string;
      tenantId: string;
      companyId: string;
    },
    deps?: RegistrationWorkflowDeps,
  ): Promise<string | null>;
  loadPresentation(
    registrationId: string,
    context: RegistrationLoaderContext,
    deps?: RegistrationWorkflowDeps,
  ): Promise<RegistrationSourceState<RegistrationPresentation>>;
};

// Resolves the single active registration for a company scope, then loads the
// role-redacted presentation. Any resolution failure or absence collapses to the
// fail-closed unavailable state — never a thrown error and never an existence
// signal distinct from a forbidden/not-found read.
export async function resolveScopedRegistrationPresentation(
  scope: {
    role: ResolveActiveRegistrationRole;
    actorId: string;
    tenantId: string;
    companyId: string;
  },
  loaderContext: RegistrationLoaderContext,
  deps: ResolveScopedPresentationDeps,
): Promise<RegistrationSourceState<RegistrationPresentation>> {
  let registrationId: string | null = null;
  try {
    registrationId = await deps.resolveActiveRegistration(scope);
  } catch {
    return REGISTRATION_UNAVAILABLE;
  }
  if (!registrationId) return REGISTRATION_UNAVAILABLE;
  return deps.loadPresentation(registrationId, loaderContext);
}

export type ResolveEmployeeVisaDeps = {
  resolveActiveRegistration(
    context: {
      role: ResolveActiveRegistrationRole;
      actorId: string;
      tenantId: string;
      companyId: string;
    },
    deps?: RegistrationWorkflowDeps,
  ): Promise<string | null>;
  loadVisaPresentation(
    registrationId: string,
    context: RegistrationLoaderContext,
    deps?: RegistrationWorkflowDeps,
  ): Promise<RegistrationSourceState<RegistrationPresentation['visaPeople']>>;
};

// Resolves the active registration for an employee's company scope, then loads
// ONLY that employee's own visa person. Any resolution failure or absence
// collapses to the fail-closed visa-unavailable state. The employee never sees
// another person: the loader routes through the employee-scoped read RPC, which
// keys the visa person by the actor's OWN employee_id (not an ordinal position).
export async function resolveEmployeeVisaPresentation(
  scope: { actorId: string; tenantId: string; companyId: string },
  deps: ResolveEmployeeVisaDeps,
): Promise<RegistrationSourceState<RegistrationPresentation['visaPeople']>> {
  let registrationId: string | null = null;
  try {
    registrationId = await deps.resolveActiveRegistration({ role: 'employee', ...scope });
  } catch {
    return visaUnavailable;
  }
  if (!registrationId) return visaUnavailable;
  return deps.loadVisaPresentation(registrationId, {
    role: 'employee',
    actorId: scope.actorId,
    tenantId: scope.tenantId,
    companyId: scope.companyId,
  });
}
