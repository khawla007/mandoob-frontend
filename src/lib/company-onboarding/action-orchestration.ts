import { z, type ZodError } from 'zod';

import {
  type CompanyReadinessCode,
  type CompanyReadinessRequirement,
} from '@/lib/company-onboarding/contracts';
import type { OnboardingMutationResult } from '@/lib/data/company-onboarding-mutations';
import {
  activateCompanyOnboardingSchema,
  clearCompanyBankIdentifierSchema,
  companyActivitiesSectionSchema,
  companyBankSectionSchema,
  companyEstablishmentSectionSchema,
  companyLegalSectionSchema,
  companyOfficeSectionSchema,
  companyShareholdersSectionSchema,
  reopenCompanyOnboardingSectionSchema,
  submitCompanyOnboardingSchema,
} from '@/lib/validation/company-onboarding';

export type OnboardingActionKind =
  | 'legal'
  | 'shareholders'
  | 'activities'
  | 'office'
  | 'establishment'
  | 'bank'
  | 'clearBankIdentifier'
  | 'reopen'
  | 'submit'
  | 'activate';

export type OnboardingPublicErrorCode =
  | 'COMPANY_NOT_FOUND'
  | 'ASSIGNMENT_NOT_FOUND'
  | 'COMPANY_INACTIVE'
  | 'STALE_ONBOARDING_VERSION'
  | 'INVALID_SECTION_INPUT'
  | 'SECTION_NOT_COMPLETABLE'
  | 'ONBOARDING_NOT_SUBMITTABLE'
  | 'COMPANY_NOT_READY'
  | 'OPERATION_REUSED'
  | 'INTERNAL';

/**
 * operationId is public retry metadata, not company data. Keeping it in state lets
 * React resend the same command after a transport failure and rotate it after a response.
 */
export type OnboardingActionState =
  | { status: 'idle'; version: number; operationId: string }
  | { status: 'saved'; version: number; operationId: string; message: 'saved' }
  | {
      status: 'error';
      version: number;
      operationId: string;
      code: OnboardingPublicErrorCode;
      fieldErrors?: Record<string, string>;
      requirements?: CompanyReadinessCode[];
    };

export type OnboardingActionScope = {
  actorProfileId: string;
  tenantId: string;
  companyId: string;
};

export type OnboardingScopeSnapshot = {
  tenantId: string;
  companyId: string;
  companyName: string;
  onboardingVersion: number;
};

export type OnboardingMutationInput = OnboardingActionScope & {
  operationId: string;
  expectedVersion: number;
  [key: string]: unknown;
};

export type OnboardingCoreDependencies = {
  read(scope: OnboardingActionScope): Promise<OnboardingScopeSnapshot | null>;
  mutate(
    kind: OnboardingActionKind,
    input: OnboardingMutationInput,
  ): Promise<OnboardingMutationResult>;
  createOperationId(): string;
  revalidate(path: string): void;
  redirect(path: string): void;
  reportError?(event: string, error: unknown): void;
};

type CoreOptions = {
  kind: OnboardingActionKind;
  scope: OnboardingActionScope;
  previousState: OnboardingActionState;
  formData: FormData;
  notFoundCode: 'COMPANY_NOT_FOUND' | 'ASSIGNMENT_NOT_FOUND';
  revalidationPaths: string[];
  successRedirect?: string;
};

const uuid = z.string().uuid();
const version = z.number().int().nonnegative();

export function createActionState(
  onboardingVersion: number,
  createOperationId: () => string,
): OnboardingActionState {
  return {
    status: 'idle',
    version: onboardingVersion,
    operationId: createOperationId(),
  };
}

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === 'string' ? entry : '';
}

function booleanValue(formData: FormData, key: string): boolean {
  return ['1', 'on', 'true'].includes(value(formData, key));
}

function jsonValue(formData: FormData, key: string): unknown {
  try {
    return JSON.parse(value(formData, key));
  } catch {
    return undefined;
  }
}

function command(options: CoreOptions) {
  return {
    actorProfileId: options.scope.actorProfileId,
    tenantId: options.scope.tenantId,
    companyId: options.scope.companyId,
    operationId: options.previousState.operationId,
    expectedVersion: options.previousState.version,
  };
}

function parseInput(
  options: CoreOptions,
  snapshot: OnboardingScopeSnapshot,
): { success: true; data: OnboardingMutationInput } | { success: false; error: ZodError } {
  const base = command(options);
  const formData = options.formData;
  let schema: z.ZodType;
  let raw: Record<string, unknown>;

  switch (options.kind) {
    case 'legal':
      schema = companyLegalSectionSchema;
      raw = {
        ...base,
        completeSection: booleanValue(formData, 'completeSection'),
        companyName: value(formData, 'companyName'),
        displayName: value(formData, 'displayName'),
        jurisdictionType: value(formData, 'jurisdictionType'),
        licensingAuthority: value(formData, 'licensingAuthority'),
        legalStructure: value(formData, 'legalStructure'),
        tradeLicenseNo: value(formData, 'tradeLicenseNo'),
        licenseExpiry: value(formData, 'licenseExpiry'),
      };
      break;
    case 'shareholders':
      schema = companyShareholdersSectionSchema;
      raw = {
        ...base,
        completeSection: booleanValue(formData, 'completeSection'),
        shareholders: jsonValue(formData, 'shareholders'),
      };
      break;
    case 'activities':
      schema = companyActivitiesSectionSchema;
      raw = {
        ...base,
        completeSection: booleanValue(formData, 'completeSection'),
        activities: jsonValue(formData, 'activities'),
      };
      break;
    case 'office':
      schema = companyOfficeSectionSchema;
      raw = {
        ...base,
        completeSection: booleanValue(formData, 'completeSection'),
        officeType: value(formData, 'officeType'),
        addressLine1: value(formData, 'addressLine1'),
        addressLine2: value(formData, 'addressLine2'),
        area: value(formData, 'area'),
        city: value(formData, 'city'),
        emirate: value(formData, 'emirate'),
        postalCode: value(formData, 'postalCode'),
        countryCode: value(formData, 'countryCode'),
        providerName: value(formData, 'providerName'),
        leaseReference: value(formData, 'leaseReference'),
        leaseExpiry: value(formData, 'leaseExpiry'),
      };
      break;
    case 'establishment':
      schema = companyEstablishmentSectionSchema;
      raw = {
        ...base,
        completeSection: booleanValue(formData, 'completeSection'),
        establishmentCardNumber: value(formData, 'establishmentCardNumber'),
        establishmentCardExpiry: value(formData, 'establishmentCardExpiry'),
      };
      break;
    case 'bank':
      schema = companyBankSectionSchema;
      raw = {
        ...base,
        completeSection: booleanValue(formData, 'completeSection'),
        bankName: value(formData, 'bankName'),
        branchName: value(formData, 'branchName'),
        accountHolderName: value(formData, 'accountHolderName'),
        currencyCode: value(formData, 'currencyCode'),
        swiftBic: value(formData, 'swiftBic'),
        iban: value(formData, 'iban'),
        accountNumber: value(formData, 'accountNumber'),
      };
      break;
    case 'clearBankIdentifier':
      schema = clearCompanyBankIdentifierSchema;
      raw = {
        ...base,
        identifier: value(formData, 'identifier'),
        companyNameConfirmation: value(formData, 'companyNameConfirmation'),
        expectedCompanyName: snapshot.companyName,
      };
      break;
    case 'reopen':
      schema = reopenCompanyOnboardingSectionSchema;
      raw = {
        ...base,
        section: value(formData, 'section'),
        reason: value(formData, 'reason'),
      };
      break;
    case 'submit':
      schema = submitCompanyOnboardingSchema;
      raw = base;
      break;
    case 'activate':
      schema = activateCompanyOnboardingSchema;
      raw = base;
      break;
  }

  const parsed = schema.safeParse(raw);
  return parsed.success
    ? {
        success: true,
        data: {
          actorProfileId: options.scope.actorProfileId,
          ...(parsed.data as Record<string, unknown>),
        } as OnboardingMutationInput,
      }
    : { success: false, error: parsed.error };
}

function newOperationId(deps: OnboardingCoreDependencies): string {
  const operationId = deps.createOperationId();
  return uuid.safeParse(operationId).success ? operationId : crypto.randomUUID();
}

function errorState(
  options: CoreOptions,
  deps: OnboardingCoreDependencies,
  code: OnboardingPublicErrorCode,
  additions: Pick<
    Extract<OnboardingActionState, { status: 'error' }>,
    'fieldErrors' | 'requirements'
  > = {},
): OnboardingActionState {
  return {
    status: 'error',
    version: options.previousState.version,
    operationId: newOperationId(deps),
    code,
    ...additions,
  };
}

function validationState(
  options: CoreOptions,
  deps: OnboardingCoreDependencies,
  error: ZodError,
): OnboardingActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      typeof field === 'string' &&
      !['tenantId', 'companyId', 'operationId', 'expectedVersion'].includes(field)
    ) {
      fieldErrors[field] = 'invalid';
    }
  }
  return errorState(
    options,
    deps,
    'INVALID_SECTION_INPUT',
    Object.keys(fieldErrors).length ? { fieldErrors } : {},
  );
}

const MUTATION_ERROR_CODES: Record<
  Exclude<OnboardingMutationResult, { ok: true }>['code'],
  OnboardingPublicErrorCode
> = {
  notFound: 'COMPANY_NOT_FOUND',
  inactive: 'COMPANY_INACTIVE',
  conflict: 'STALE_ONBOARDING_VERSION',
  validation: 'INVALID_SECTION_INPUT',
  incomplete: 'SECTION_NOT_COMPLETABLE',
  invalidState: 'ONBOARDING_NOT_SUBMITTABLE',
  operationConflict: 'OPERATION_REUSED',
  unexpected: 'INTERNAL',
};

function readinessRequirements(
  result: Extract<OnboardingMutationResult, { ok: true }>,
): CompanyReadinessCode[] {
  return (result.requirements ?? []).map(
    (requirement: CompanyReadinessRequirement) => requirement.code,
  );
}

export async function runOnboardingAction(
  options: CoreOptions,
  deps: OnboardingCoreDependencies,
): Promise<OnboardingActionState> {
  const scope = z
    .object({ actorProfileId: uuid, tenantId: uuid, companyId: uuid })
    .safeParse(options.scope);
  if (
    !scope.success ||
    !version.safeParse(options.previousState.version).success ||
    !uuid.safeParse(options.previousState.operationId).success
  ) {
    return errorState(options, deps, 'INVALID_SECTION_INPUT');
  }

  let snapshot: OnboardingScopeSnapshot | null;
  try {
    snapshot = await deps.read(scope.data);
  } catch (error) {
    deps.reportError?.('company-onboarding.read-failed', error);
    return errorState(options, deps, 'INTERNAL');
  }
  if (
    !snapshot ||
    snapshot.companyId !== scope.data.companyId ||
    snapshot.tenantId !== scope.data.tenantId
  ) {
    return errorState(options, deps, options.notFoundCode);
  }

  const parsed = parseInput(options, snapshot);
  if (!parsed.success) return validationState(options, deps, parsed.error);

  let mutation: OnboardingMutationResult;
  try {
    mutation = await deps.mutate(options.kind, parsed.data);
  } catch (error) {
    deps.reportError?.('company-onboarding.mutation-failed', error);
    return errorState(options, deps, 'INTERNAL');
  }
  if (!mutation.ok) {
    const code =
      mutation.code === 'notFound' ? options.notFoundCode : MUTATION_ERROR_CODES[mutation.code];
    return errorState(options, deps, code);
  }
  if (mutation.companyId !== scope.data.companyId) {
    deps.reportError?.('company-onboarding.mutation-scope-mismatch', undefined);
    return errorState(options, deps, 'INTERNAL');
  }

  if (
    (options.kind === 'submit' && mutation.ready !== true) ||
    (options.kind === 'activate' && mutation.activated !== true)
  ) {
    return errorState(options, deps, 'COMPANY_NOT_READY', {
      requirements: readinessRequirements(mutation),
    });
  }

  for (const path of options.revalidationPaths) deps.revalidate(path);
  if (options.successRedirect) deps.redirect(options.successRedirect);
  return {
    status: 'saved',
    version: mutation.onboardingVersion,
    operationId: newOperationId(deps),
    message: 'saved',
  };
}
