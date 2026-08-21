import {
  COMPANY_ONBOARDING_READINESS_CODES,
  type CompanyReadinessCode,
  type CompanyReadinessRequirement,
} from './contracts';

const metadata = {
  LEGAL_SECTION_INCOMPLETE: ['legal', 'blocked'],
  LEGAL_NAME_MISSING: ['legal', 'missing'],
  JURISDICTION_TYPE_MISSING: ['legal', 'missing'],
  LICENSING_AUTHORITY_MISSING: ['legal', 'missing'],
  LEGAL_STRUCTURE_MISSING: ['legal', 'missing'],
  TRADE_LICENSE_MISSING: ['legal', 'missing'],
  LICENSE_EXPIRY_MISSING: ['legal', 'missing'],
  LICENSE_EXPIRED: ['legal', 'expired'],
  SHAREHOLDERS_SECTION_INCOMPLETE: ['shareholders', 'blocked'],
  SHAREHOLDER_MISSING: ['shareholders', 'missing'],
  OWNERSHIP_TOTAL_NOT_100: ['shareholders', 'invalid'],
  ACTIVITIES_SECTION_INCOMPLETE: ['activities', 'blocked'],
  ACTIVITY_MISSING: ['activities', 'missing'],
  PRIMARY_ACTIVITY_MISSING: ['activities', 'invalid'],
  OFFICE_SECTION_INCOMPLETE: ['office', 'blocked'],
  OFFICE_TYPE_MISSING: ['office', 'missing'],
  OFFICE_ADDRESS_MISSING: ['office', 'missing'],
  OFFICE_LEASE_REFERENCE_MISSING: ['office', 'missing'],
  OFFICE_LEASE_EXPIRY_MISSING: ['office', 'missing'],
  OFFICE_LEASE_EXPIRED: ['office', 'expired'],
  ESTABLISHMENT_SECTION_INCOMPLETE: ['establishment', 'blocked'],
  ESTABLISHMENT_CARD_MISSING: ['establishment', 'missing'],
  ESTABLISHMENT_CARD_EXPIRY_MISSING: ['establishment', 'missing'],
  ESTABLISHMENT_CARD_EXPIRED: ['establishment', 'expired'],
  BANK_SECTION_INCOMPLETE: ['bank', 'blocked'],
  BANK_ACCOUNT_MISSING: ['bank', 'missing'],
  ACTIVE_VERIFIED_PRO_ASSIGNMENT_MISSING: ['assignment', 'blocked'],
  TENANT_NOT_ACTIVATABLE: ['workspace', 'blocked'],
} as const satisfies Record<CompanyReadinessCode, readonly [string, string]>;

const readinessCodeSet = new Set<string>(COMPANY_ONBOARDING_READINESS_CODES);
const order = new Map<string, number>(
  COMPANY_ONBOARDING_READINESS_CODES.map((code, index) => [code, index]),
);

export class CompanyReadinessResponseError extends Error {
  readonly code = 'READINESS_RESPONSE_INVALID' as const;

  constructor() {
    super('READINESS_RESPONSE_INVALID');
    this.name = 'CompanyReadinessResponseError';
  }
}

function invalid(): never {
  throw new CompanyReadinessResponseError();
}

export function parseCompanyReadinessRequirements(value: unknown): CompanyReadinessRequirement[] {
  if (!Array.isArray(value)) invalid();

  const seen = new Set<string>();
  const requirements = value.map((row): CompanyReadinessRequirement => {
    if (!row || typeof row !== 'object') invalid();
    const { code, section, state } = row as Record<string, unknown>;
    if (typeof code !== 'string' || !readinessCodeSet.has(code) || seen.has(code)) invalid();
    const expected = metadata[code as CompanyReadinessCode];
    if (section !== expected[0] || state !== expected[1]) invalid();
    seen.add(code);
    return { code: code as CompanyReadinessCode, section, state } as CompanyReadinessRequirement;
  });

  return requirements.sort((left, right) => order.get(left.code)! - order.get(right.code)!);
}
