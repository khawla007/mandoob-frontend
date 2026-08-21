import 'server-only';
import { z } from 'zod';
import {
  type CompanyOnboardingSectionKey,
  type CompanyOnboardingSectionStatus,
  type CompanyOnboardingStatus,
  type CompanyReadinessRequirement,
} from '@/lib/company-onboarding/contracts';
import { parseCompanyReadinessRequirements } from '@/lib/company-onboarding/readiness';
import { createBlindIndex, encrypt as encryptPii } from '@/lib/crypto/pii';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
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

type RpcResult = { data: unknown; error: { message?: string } | null };
type MutationClient = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>;
};
type MutationDependencies = {
  client?: MutationClient;
  log?: (event: string) => void;
};

export type OnboardingMutationErrorCode =
  | 'notFound'
  | 'inactive'
  | 'conflict'
  | 'validation'
  | 'incomplete'
  | 'invalidState'
  | 'operationConflict'
  | 'unexpected';

export type OnboardingMutationResult =
  | {
      ok: true;
      companyId: string;
      onboardingVersion: number;
      onboardingStatus?: CompanyOnboardingStatus;
      section?: CompanyOnboardingSectionKey;
      sectionStatus?: CompanyOnboardingSectionStatus;
      identifier?: 'iban' | 'account_number';
      ready?: boolean;
      activated?: boolean;
      requirements?: CompanyReadinessRequirement[];
    }
  | { ok: false; code: OnboardingMutationErrorCode };

type ActorInput<T> = T & { actorProfileId: string };
type Command = {
  tenantId: string;
  companyId: string;
  operationId: string;
  expectedVersion: number;
};

const uuidSchema = z.string().uuid();
const OPERATION_HASH_DOMAIN = 'company-onboarding-operation:v1';

const ERROR_CODES: Record<string, OnboardingMutationErrorCode> = {
  ASSIGNMENT_NOT_FOUND: 'notFound',
  COMPANY_NOT_FOUND: 'notFound',
  FORBIDDEN: 'notFound',
  COMPANY_INACTIVE: 'inactive',
  STALE_ONBOARDING_VERSION: 'conflict',
  INVALID_SECTION_INPUT: 'validation',
  SECTION_NOT_COMPLETABLE: 'incomplete',
  ONBOARDING_NOT_SUBMITTABLE: 'invalidState',
  OPERATION_REUSED: 'operationConflict',
};

const sectionResultSchema = z
  .object({
    company_id: uuidSchema,
    section: z.enum(['legal', 'shareholders', 'activities', 'office', 'establishment', 'bank']),
    section_status: z.enum(['incomplete', 'complete']),
    onboarding_status: z.enum(['not_started', 'in_progress', 'ready_for_activation', 'completed']),
    onboarding_version: z.number().int().nonnegative(),
  })
  .strict();

const clearResultSchema = z
  .object({
    company_id: uuidSchema,
    identifier: z.enum(['iban', 'account_number']),
    onboarding_version: z.number().int().nonnegative(),
  })
  .strict();

const reopenResultSchema = z
  .object({
    company_id: uuidSchema,
    section: z.enum(['legal', 'shareholders', 'activities', 'office', 'establishment', 'bank']),
    onboarding_status: z.literal('in_progress'),
    onboarding_version: z.number().int().nonnegative(),
  })
  .strict();

const finalResultSchema = z
  .object({
    company_id: uuidSchema,
    ready: z.boolean().optional(),
    activated: z.boolean().optional(),
    requirements: z.array(z.unknown()),
    onboarding_version: z.number().int().nonnegative(),
  })
  .strict();

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function operationHash(rpcName: string, logicalPayload: unknown): string {
  return createBlindIndex(
    OPERATION_HASH_DOMAIN,
    canonicalJson({ operation: rpcName, payload: logicalPayload }),
  );
}

function log(dependencies: MutationDependencies, event: string): void {
  dependencies.log?.(event);
}

async function invoke<T>(options: {
  actorProfileId: string;
  command: Command;
  rpcName: string;
  diagnostic: string;
  payload: Record<string, unknown>;
  logicalPayload?: Record<string, unknown>;
  resultSchema: z.ZodType<T>;
  map: (value: T) => OnboardingMutationResult | null;
  dependencies: MutationDependencies;
}): Promise<OnboardingMutationResult> {
  const client =
    options.dependencies.client ?? (createSupabaseServiceRoleClient() as unknown as MutationClient);
  let response: RpcResult;
  try {
    response = await client.rpc(options.rpcName, {
      p_actor_id: options.actorProfileId,
      p_tenant_id: options.command.tenantId,
      p_company_id: options.command.companyId,
      p_expected_onboarding_version: options.command.expectedVersion,
      p_operation_id: options.command.operationId,
      p_payload_hash: operationHash(options.rpcName, options.logicalPayload ?? options.payload),
      p_payload: options.payload,
    });
  } catch {
    log(options.dependencies, `${options.diagnostic}-failed`);
    return { ok: false, code: 'unexpected' };
  }

  if (response.error) {
    const code = response.error.message ? ERROR_CODES[response.error.message] : undefined;
    if (code) return { ok: false, code };
    log(options.dependencies, `${options.diagnostic}-failed`);
    return { ok: false, code: 'unexpected' };
  }

  const parsed = options.resultSchema.safeParse(response.data);
  if (!parsed.success) {
    log(options.dependencies, `${options.diagnostic}-invalid-result`);
    return { ok: false, code: 'unexpected' };
  }
  const result = options.map(parsed.data);
  if (!result || (result.ok && result.companyId !== options.command.companyId)) {
    log(options.dependencies, `${options.diagnostic}-invalid-result`);
    return { ok: false, code: 'unexpected' };
  }
  return result;
}

function invalid(): OnboardingMutationResult {
  return { ok: false, code: 'validation' };
}

function parseActor(value: unknown): string | null {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function sectionMap(value: z.infer<typeof sectionResultSchema>): OnboardingMutationResult {
  return {
    ok: true,
    companyId: value.company_id,
    section: value.section,
    sectionStatus: value.section_status,
    onboardingStatus: value.onboarding_status,
    onboardingVersion: value.onboarding_version,
  };
}

export async function saveCompanyLegalSection(
  input: ActorInput<z.input<typeof companyLegalSectionSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = companyLegalSectionSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  const payload = {
    complete_section: parsed.data.completeSection,
    company_name: parsed.data.companyName,
    display_name: parsed.data.displayName,
    jurisdiction_type: parsed.data.jurisdictionType,
    licensing_authority: parsed.data.licensingAuthority,
    legal_structure: parsed.data.legalStructure,
    trade_license_no: parsed.data.tradeLicenseNo,
    license_expiry: parsed.data.licenseExpiry,
  };
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'save_company_legal_section',
    diagnostic: 'company-onboarding.legal-save',
    payload,
    resultSchema: sectionResultSchema,
    map: sectionMap,
    dependencies,
  });
}

export async function saveCompanyShareholdersSection(
  input: ActorInput<z.input<typeof companyShareholdersSectionSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = companyShareholdersSectionSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  const logicalShareholders = parsed.data.shareholders.map((shareholder) =>
    shareholder.kind === 'individual'
      ? {
          ...(shareholder.id ? { id: shareholder.id } : {}),
          kind: shareholder.kind,
          full_name: shareholder.fullName,
          nationality_code: shareholder.nationalityCode,
          passport_number: shareholder.passportNumber,
          ownership_percent: shareholder.ownershipPercent,
          sort_order: shareholder.sortOrder,
        }
      : {
          ...(shareholder.id ? { id: shareholder.id } : {}),
          kind: shareholder.kind,
          legal_name: shareholder.legalName,
          country_of_incorporation: shareholder.countryOfIncorporation,
          registration_number: shareholder.registrationNumber,
          ownership_percent: shareholder.ownershipPercent,
          sort_order: shareholder.sortOrder,
        },
  );
  const shareholders = logicalShareholders.map((shareholder) => {
    if (shareholder.kind === 'individual') {
      const identifier = shareholder.passport_number;
      return {
        ...(shareholder.id ? { id: shareholder.id } : {}),
        kind: shareholder.kind,
        full_name: shareholder.full_name,
        nationality_code: shareholder.nationality_code,
        ownership_percent: shareholder.ownership_percent,
        sort_order: shareholder.sort_order,
        passport_no_encrypted: identifier ? encryptPii(identifier) : null,
        passport_no_hash: identifier
          ? createBlindIndex('company-shareholder-passport:v1', identifier)
          : null,
        passport_no_last4: identifier ? identifier.slice(-4) : null,
      };
    }
    const identifier = shareholder.registration_number;
    return {
      ...(shareholder.id ? { id: shareholder.id } : {}),
      kind: shareholder.kind,
      legal_name: shareholder.legal_name,
      country_of_incorporation: shareholder.country_of_incorporation,
      ownership_percent: shareholder.ownership_percent,
      sort_order: shareholder.sort_order,
      registration_no_encrypted: identifier ? encryptPii(identifier) : null,
      registration_no_hash: identifier
        ? createBlindIndex('company-shareholder-registration:v1', identifier)
        : null,
      registration_no_last4: identifier ? identifier.slice(-4) : null,
    };
  });
  const payload = { complete_section: parsed.data.completeSection, shareholders };
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'save_company_shareholders_section',
    diagnostic: 'company-onboarding.shareholders-save',
    payload,
    logicalPayload: {
      complete_section: parsed.data.completeSection,
      shareholders: logicalShareholders,
    },
    resultSchema: sectionResultSchema,
    map: sectionMap,
    dependencies,
  });
}

export async function saveCompanyActivitiesSection(
  input: ActorInput<z.input<typeof companyActivitiesSectionSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = companyActivitiesSectionSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  const payload = {
    complete_section: parsed.data.completeSection,
    activities: parsed.data.activities.map((activity) => ({
      ...(activity.id ? { id: activity.id } : {}),
      activity_code: activity.activityCode,
      activity_name: activity.activityName,
      authority_name: activity.authorityName,
      is_primary: activity.isPrimary,
      sort_order: activity.sortOrder,
    })),
  };
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'save_company_activities_section',
    diagnostic: 'company-onboarding.activities-save',
    payload,
    resultSchema: sectionResultSchema,
    map: sectionMap,
    dependencies,
  });
}

export async function saveCompanyOfficeSection(
  input: ActorInput<z.input<typeof companyOfficeSectionSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = companyOfficeSectionSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  const payload = {
    complete_section: parsed.data.completeSection,
    office_type: parsed.data.officeType,
    address_line_1: parsed.data.addressLine1,
    address_line_2: parsed.data.addressLine2,
    area: parsed.data.area,
    city: parsed.data.city,
    emirate: parsed.data.emirate,
    postal_code: parsed.data.postalCode,
    country_code: parsed.data.countryCode,
    provider_name: parsed.data.providerName,
    lease_reference: parsed.data.leaseReference,
    lease_expiry: parsed.data.leaseExpiry,
  };
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'save_company_office_section',
    diagnostic: 'company-onboarding.office-save',
    payload,
    resultSchema: sectionResultSchema,
    map: sectionMap,
    dependencies,
  });
}

export async function saveCompanyEstablishmentSection(
  input: ActorInput<z.input<typeof companyEstablishmentSectionSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = companyEstablishmentSectionSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  const identifier = parsed.data.establishmentCardNumber;
  const payload = {
    complete_section: parsed.data.completeSection,
    card_no_encrypted: identifier ? encryptPii(identifier) : null,
    card_no_hash: identifier ? createBlindIndex('company-establishment-card:v1', identifier) : null,
    card_no_last4: identifier ? identifier.slice(-4) : null,
    card_expiry: parsed.data.establishmentCardExpiry,
  };
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'save_company_establishment_section',
    diagnostic: 'company-onboarding.establishment-save',
    payload,
    logicalPayload: {
      complete_section: parsed.data.completeSection,
      card_number: identifier,
      card_expiry: parsed.data.establishmentCardExpiry,
    },
    resultSchema: sectionResultSchema,
    map: sectionMap,
    dependencies,
  });
}

export async function saveCompanyBankSection(
  input: ActorInput<z.input<typeof companyBankSectionSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = companyBankSectionSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  const { iban, accountNumber } = parsed.data;
  const logicalPayload = {
    complete_section: parsed.data.completeSection,
    bank_name: parsed.data.bankName,
    branch_name: parsed.data.branchName,
    account_holder_name: parsed.data.accountHolderName,
    currency_code: parsed.data.currencyCode,
    swift_bic: parsed.data.swiftBic || null,
    iban,
    account_number: accountNumber,
  };
  const payload = {
    complete_section: parsed.data.completeSection,
    bank_name: parsed.data.bankName,
    branch_name: parsed.data.branchName,
    account_holder_name: parsed.data.accountHolderName,
    currency_code: parsed.data.currencyCode,
    swift_bic: parsed.data.swiftBic || null,
    iban_encrypted: iban ? encryptPii(iban) : null,
    iban_hash: iban ? createBlindIndex('company-bank-iban:v1', iban) : null,
    iban_last4: iban ? iban.slice(-4) : null,
    account_number_encrypted: accountNumber ? encryptPii(accountNumber) : null,
    account_number_hash: accountNumber
      ? createBlindIndex('company-bank-account:v1', accountNumber)
      : null,
    account_number_last4: accountNumber ? accountNumber.slice(-4) : null,
  };
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'save_company_bank_section',
    diagnostic: 'company-onboarding.bank-save',
    payload,
    logicalPayload,
    resultSchema: sectionResultSchema,
    map: sectionMap,
    dependencies,
  });
}

export async function clearCompanyBankIdentifier(
  input: ActorInput<z.input<typeof clearCompanyBankIdentifierSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = clearCompanyBankIdentifierSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'clear_company_bank_identifier',
    diagnostic: 'company-onboarding.bank-clear',
    payload: { identifier: parsed.data.identifier },
    resultSchema: clearResultSchema,
    map: (value) => ({
      ok: true,
      companyId: value.company_id,
      identifier: value.identifier,
      onboardingVersion: value.onboarding_version,
    }),
    dependencies,
  });
}

export async function reopenCompanyOnboardingSection(
  input: ActorInput<z.input<typeof reopenCompanyOnboardingSectionSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = reopenCompanyOnboardingSectionSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'reopen_company_onboarding_section',
    diagnostic: 'company-onboarding.reopen',
    payload: { section: parsed.data.section, reason: parsed.data.reason },
    resultSchema: reopenResultSchema,
    map: (value) => ({
      ok: true,
      companyId: value.company_id,
      section: value.section,
      onboardingStatus: value.onboarding_status,
      onboardingVersion: value.onboarding_version,
    }),
    dependencies,
  });
}

function finalMap(
  value: z.infer<typeof finalResultSchema>,
  kind: 'ready' | 'activated',
): OnboardingMutationResult | null {
  if (typeof value[kind] !== 'boolean') return null;
  let requirements: CompanyReadinessRequirement[];
  try {
    requirements = parseCompanyReadinessRequirements(value.requirements);
  } catch {
    return null;
  }
  return {
    ok: true,
    companyId: value.company_id,
    [kind]: value[kind],
    requirements,
    onboardingVersion: value.onboarding_version,
  };
}

export async function submitCompanyOnboarding(
  input: ActorInput<z.input<typeof submitCompanyOnboardingSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = submitCompanyOnboardingSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'submit_company_onboarding_for_activation',
    diagnostic: 'company-onboarding.submit',
    payload: {},
    resultSchema: finalResultSchema,
    map: (value) => finalMap(value, 'ready'),
    dependencies,
  });
}

export async function activateCompanyOnboarding(
  input: ActorInput<z.input<typeof activateCompanyOnboardingSchema>>,
  dependencies: MutationDependencies = {},
): Promise<OnboardingMutationResult> {
  const actor = parseActor(input.actorProfileId);
  const parsed = activateCompanyOnboardingSchema.safeParse(input);
  if (!actor || !parsed.success) return invalid();
  return invoke({
    actorProfileId: actor,
    command: parsed.data,
    rpcName: 'activate_company_onboarding',
    diagnostic: 'company-onboarding.activate',
    payload: {},
    resultSchema: finalResultSchema,
    map: (value) => finalMap(value, 'activated'),
    dependencies,
  });
}
