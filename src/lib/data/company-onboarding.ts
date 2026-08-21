import 'server-only';
import { z } from 'zod';
import {
  COMPANY_ONBOARDING_READINESS_STATES,
  COMPANY_ONBOARDING_SECTION_KEYS,
  COMPANY_ONBOARDING_SECTION_STATUSES,
  COMPANY_ONBOARDING_STATUSES,
  type CompanyOnboardingSectionKey,
  type CompanyOnboardingSectionStatus,
  type CompanyReadinessRequirement,
} from '@/lib/company-onboarding/contracts';
import { parseCompanyReadinessRequirements } from '@/lib/company-onboarding/readiness';
import type { Database } from '@/lib/db/database.types';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type CompanyStatus = Database['public']['Enums']['company_status'];
type JurisdictionType = Database['public']['Enums']['company_jurisdiction_type'];
type OfficeType = Database['public']['Enums']['company_office_type'];
type OnboardingStatus = Database['public']['Enums']['company_onboarding_status'];

type RpcResult = { data: unknown; error: { message?: string } | null };
type OnboardingClient = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>;
};
type OnboardingDependencies = {
  supabase?: OnboardingClient;
  log?: (event: string) => void;
};

export type CompanyOnboardingSnapshot = {
  companyId: string;
  tenantId: string;
  companyName: string;
  displayName: string | null;
  companyStatus: CompanyStatus;
  jurisdictionType: JurisdictionType | null;
  licensingAuthority: string | null;
  legalStructure: string | null;
  tradeLicenseNo: string | null;
  licenseExpiry: string | null;
  establishmentCardMasked: string | null;
  establishmentCardExpiry: string | null;
  onboardingStatus: OnboardingStatus;
  onboardingVersion: number;
  shareholders: Array<
    | {
        id: string;
        kind: 'individual';
        fullName: string;
        nationalityCode: string;
        passportMasked: string | null;
        ownershipPercent: string;
        sortOrder: number;
      }
    | {
        id: string;
        kind: 'company';
        legalName: string;
        countryOfIncorporation: string;
        registrationMasked: string;
        ownershipPercent: string;
        sortOrder: number;
      }
  >;
  activities: Array<{
    id: string;
    activityCode: string;
    activityName: string;
    authorityName: string;
    isPrimary: boolean;
    sortOrder: number;
  }>;
  office: {
    officeType: OfficeType;
    addressLine1: string | null;
    addressLine2: string | null;
    area: string | null;
    city: string | null;
    emirate: string | null;
    postalCode: string | null;
    countryCode: string;
    providerName: string | null;
    leaseReference: string | null;
    leaseExpiry: string | null;
  } | null;
  bank: {
    bankName: string;
    branchName: string | null;
    accountHolderName: string;
    currencyCode: string;
    swiftBicMasked: string | null;
    ibanMasked: string | null;
    accountNumberMasked: string | null;
  } | null;
  sectionProgress: Record<
    CompanyOnboardingSectionKey,
    { status: CompanyOnboardingSectionStatus; completedAt: string | null }
  >;
  requirements: CompanyReadinessRequirement[];
};

const uuidSchema = z.string().uuid();
const nullableText = z.string().nullable();
const nullableDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .nullable();
const nullableTimestamp = z.string().datetime({ offset: true }).nullable();
const maskedValue = z
  .string()
  .regex(/^•••• [A-Z0-9]{1,4}$/u)
  .nullable();
const ownershipPercent = z.string().regex(/^\d{1,3}\.\d{4}$/u);

const individualShareholderSchema = z.object({
  id: uuidSchema,
  kind: z.literal('individual'),
  full_name: z.string(),
  nationality_code: z.string().regex(/^[A-Z]{2}$/u),
  passport_masked: maskedValue,
  legal_name: z.null(),
  country_of_incorporation: z.null(),
  registration_masked: z.null(),
  ownership_percent: ownershipPercent,
  sort_order: z.number().int().nonnegative(),
});

const companyShareholderSchema = z.object({
  id: uuidSchema,
  kind: z.literal('company'),
  full_name: z.null(),
  nationality_code: z.null(),
  passport_masked: z.null(),
  legal_name: z.string(),
  country_of_incorporation: z.string().regex(/^[A-Z]{2}$/u),
  registration_masked: z.string().regex(/^•••• [A-Z0-9]{1,4}$/u),
  ownership_percent: ownershipPercent,
  sort_order: z.number().int().nonnegative(),
});

const sectionSchema = z.object({
  section_key: z.enum(COMPANY_ONBOARDING_SECTION_KEYS),
  status: z.enum(COMPANY_ONBOARDING_SECTION_STATUSES),
  completed_at: nullableTimestamp,
});

const aggregateSchema = z.object({
  company_id: uuidSchema,
  tenant_id: uuidSchema,
  company_name: z.string(),
  display_name: nullableText,
  company_status: z.enum([
    'onboarding',
    'active',
    'renewal_due',
    'renewal_overdue',
    'suspended',
    'churned',
  ]),
  jurisdiction_type: z.enum(['mainland', 'free_zone', 'offshore']).nullable(),
  licensing_authority: nullableText,
  legal_structure: nullableText,
  trade_license_no: nullableText,
  license_expiry: nullableDate,
  establishment_card_last4: z
    .string()
    .regex(/^[A-Z0-9]{1,4}$/u)
    .nullable(),
  establishment_card_expiry: nullableDate,
  onboarding_status: z.enum(COMPANY_ONBOARDING_STATUSES),
  onboarding_version: z.number().int().nonnegative(),
  shareholders: z.array(
    z.discriminatedUnion('kind', [individualShareholderSchema, companyShareholderSchema]),
  ),
  activities: z.array(
    z.object({
      id: uuidSchema,
      activity_code: z.string(),
      activity_name: z.string(),
      authority_name: z.string(),
      is_primary: z.boolean(),
      sort_order: z.number().int().nonnegative(),
    }),
  ),
  office: z
    .object({
      office_type: z.enum(['physical', 'flexi_desk', 'virtual']),
      address_line_1: nullableText,
      address_line_2: nullableText,
      area: nullableText,
      city: nullableText,
      emirate: nullableText,
      postal_code: nullableText,
      country_code: z.string().regex(/^[A-Z]{2}$/u),
      provider_name: nullableText,
      lease_reference: nullableText,
      lease_expiry: nullableDate,
    })
    .nullable(),
  bank: z
    .object({
      bank_name: z.string(),
      branch_name: nullableText,
      account_holder_name: z.string(),
      currency_code: z.string().regex(/^[A-Z]{3}$/u),
      swift_bic_masked: maskedValue,
      iban_masked: maskedValue,
      account_number_masked: maskedValue,
    })
    .nullable(),
  sections: z
    .array(sectionSchema)
    .length(COMPANY_ONBOARDING_SECTION_KEYS.length)
    .refine((rows) => new Set(rows.map(({ section_key }) => section_key)).size === rows.length),
  requirements: z.array(
    z.object({
      code: z.string(),
      section: z.string(),
      state: z.enum(COMPANY_ONBOARDING_READINESS_STATES),
    }),
  ),
});

export async function readCompanyOnboarding(
  scope: { actorProfileId: string; tenantId: string; companyId: string },
  dependencies: OnboardingDependencies = {},
): Promise<CompanyOnboardingSnapshot | null> {
  const parsedScope = z
    .object({ actorProfileId: uuidSchema, tenantId: uuidSchema, companyId: uuidSchema })
    .safeParse(scope);
  if (!parsedScope.success) return null;

  const client =
    dependencies.supabase ?? (createSupabaseServiceRoleClient() as unknown as OnboardingClient);
  const { data, error } = await client.rpc('read_company_onboarding', {
    p_actor_id: parsedScope.data.actorProfileId,
    p_tenant_id: parsedScope.data.tenantId,
    p_company_id: parsedScope.data.companyId,
  });
  if (error) {
    (dependencies.log ?? console.error)('company-onboarding.read-failed');
    return null;
  }

  const row = aggregateSchema.safeParse(data);
  if (
    !row.success ||
    row.data.company_id !== parsedScope.data.companyId ||
    row.data.tenant_id !== parsedScope.data.tenantId
  ) {
    return null;
  }

  let requirements: CompanyReadinessRequirement[];
  try {
    requirements = parseCompanyReadinessRequirements(row.data.requirements);
  } catch {
    return null;
  }

  const sectionProgress = Object.fromEntries(
    row.data.sections.map(({ section_key, status, completed_at }) => [
      section_key,
      { status, completedAt: completed_at },
    ]),
  ) as CompanyOnboardingSnapshot['sectionProgress'];

  return {
    companyId: row.data.company_id,
    tenantId: row.data.tenant_id,
    companyName: row.data.company_name,
    displayName: row.data.display_name,
    companyStatus: row.data.company_status,
    jurisdictionType: row.data.jurisdiction_type,
    licensingAuthority: row.data.licensing_authority,
    legalStructure: row.data.legal_structure,
    tradeLicenseNo: row.data.trade_license_no,
    licenseExpiry: row.data.license_expiry,
    establishmentCardMasked: row.data.establishment_card_last4
      ? `•••• ${row.data.establishment_card_last4}`
      : null,
    establishmentCardExpiry: row.data.establishment_card_expiry,
    onboardingStatus: row.data.onboarding_status,
    onboardingVersion: row.data.onboarding_version,
    shareholders: row.data.shareholders
      .toSorted(
        (left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id),
      )
      .map((shareholder) =>
        shareholder.kind === 'individual'
          ? {
              id: shareholder.id,
              kind: shareholder.kind,
              fullName: shareholder.full_name,
              nationalityCode: shareholder.nationality_code,
              passportMasked: shareholder.passport_masked,
              ownershipPercent: shareholder.ownership_percent,
              sortOrder: shareholder.sort_order,
            }
          : {
              id: shareholder.id,
              kind: shareholder.kind,
              legalName: shareholder.legal_name,
              countryOfIncorporation: shareholder.country_of_incorporation,
              registrationMasked: shareholder.registration_masked,
              ownershipPercent: shareholder.ownership_percent,
              sortOrder: shareholder.sort_order,
            },
      ),
    activities: row.data.activities
      .toSorted(
        (left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id),
      )
      .map((activity) => ({
        id: activity.id,
        activityCode: activity.activity_code,
        activityName: activity.activity_name,
        authorityName: activity.authority_name,
        isPrimary: activity.is_primary,
        sortOrder: activity.sort_order,
      })),
    office: row.data.office
      ? {
          officeType: row.data.office.office_type,
          addressLine1: row.data.office.address_line_1,
          addressLine2: row.data.office.address_line_2,
          area: row.data.office.area,
          city: row.data.office.city,
          emirate: row.data.office.emirate,
          postalCode: row.data.office.postal_code,
          countryCode: row.data.office.country_code,
          providerName: row.data.office.provider_name,
          leaseReference: row.data.office.lease_reference,
          leaseExpiry: row.data.office.lease_expiry,
        }
      : null,
    bank: row.data.bank
      ? {
          bankName: row.data.bank.bank_name,
          branchName: row.data.bank.branch_name,
          accountHolderName: row.data.bank.account_holder_name,
          currencyCode: row.data.bank.currency_code,
          swiftBicMasked: row.data.bank.swift_bic_masked,
          ibanMasked: row.data.bank.iban_masked,
          accountNumberMasked: row.data.bank.account_number_masked,
        }
      : null,
    sectionProgress,
    requirements,
  };
}
