export const COMPANY_ONBOARDING_SECTION_KEYS = [
  'legal',
  'shareholders',
  'activities',
  'office',
  'establishment',
  'bank',
] as const;

export const COMPANY_ONBOARDING_STATUSES = [
  'not_started',
  'in_progress',
  'ready_for_activation',
  'completed',
] as const;

export const COMPANY_ONBOARDING_SECTION_STATUSES = ['incomplete', 'complete'] as const;
export const COMPANY_ONBOARDING_READINESS_STATES = [
  'missing',
  'invalid',
  'expired',
  'blocked',
] as const;

export const COMPANY_ONBOARDING_READINESS_CODES = [
  'LEGAL_SECTION_INCOMPLETE',
  'LEGAL_NAME_MISSING',
  'JURISDICTION_TYPE_MISSING',
  'LICENSING_AUTHORITY_MISSING',
  'LEGAL_STRUCTURE_MISSING',
  'TRADE_LICENSE_MISSING',
  'LICENSE_EXPIRY_MISSING',
  'LICENSE_EXPIRED',
  'SHAREHOLDERS_SECTION_INCOMPLETE',
  'SHAREHOLDER_MISSING',
  'OWNERSHIP_TOTAL_NOT_100',
  'ACTIVITIES_SECTION_INCOMPLETE',
  'ACTIVITY_MISSING',
  'PRIMARY_ACTIVITY_MISSING',
  'OFFICE_SECTION_INCOMPLETE',
  'OFFICE_TYPE_MISSING',
  'OFFICE_ADDRESS_MISSING',
  'OFFICE_LEASE_REFERENCE_MISSING',
  'OFFICE_LEASE_EXPIRY_MISSING',
  'OFFICE_LEASE_EXPIRED',
  'ESTABLISHMENT_SECTION_INCOMPLETE',
  'ESTABLISHMENT_CARD_MISSING',
  'ESTABLISHMENT_CARD_EXPIRY_MISSING',
  'ESTABLISHMENT_CARD_EXPIRED',
  'BANK_SECTION_INCOMPLETE',
  'BANK_ACCOUNT_MISSING',
  'ACTIVE_VERIFIED_PRO_ASSIGNMENT_MISSING',
  'TENANT_NOT_ACTIVATABLE',
] as const;

export type CompanyOnboardingSectionKey = (typeof COMPANY_ONBOARDING_SECTION_KEYS)[number];
export type CompanyOnboardingStatus = (typeof COMPANY_ONBOARDING_STATUSES)[number];
export type CompanyOnboardingSectionStatus = (typeof COMPANY_ONBOARDING_SECTION_STATUSES)[number];
export type CompanyReadinessState = (typeof COMPANY_ONBOARDING_READINESS_STATES)[number];
export type CompanyReadinessCode = (typeof COMPANY_ONBOARDING_READINESS_CODES)[number];

export type CompanyReadinessSection = CompanyOnboardingSectionKey | 'assignment' | 'workspace';

export type CompanyReadinessRequirement = {
  code: CompanyReadinessCode;
  section: CompanyReadinessSection;
  state: CompanyReadinessState;
};

export type CompanyOnboardingCommand = {
  tenantId: string;
  companyId: string;
  operationId: string;
  expectedVersion: number;
};
