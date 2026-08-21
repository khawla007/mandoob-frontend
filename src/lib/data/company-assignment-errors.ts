const DOMAIN_CODES = [
  'PRO_ALREADY_ASSIGNED',
  'COMPANY_ALREADY_ASSIGNED',
  'PRO_NOT_VERIFIED',
  'PRO_INACTIVE',
  'PRO_PRICING_NOT_CONFIGURED',
  'PRO_COMPENSATION_NOT_CONFIGURED',
  'COMPANY_NOT_READY',
  'COMPANY_INACTIVE',
  'ASSIGNMENT_NOT_FOUND',
  'STALE_ASSIGNMENT',
  'ASSIGNMENT_CONFLICT',
] as const;

type CompanyAssignmentDomainCode = (typeof DOMAIN_CODES)[number];
type CompanyAssignmentPublicError =
  | { code: CompanyAssignmentDomainCode; status: 409 }
  | { code: 'INTERNAL'; status: 500 };

const domainCodes = new Set<string>(DOMAIN_CODES);

export function mapCompanyAssignmentError(
  error: { message?: unknown; code?: unknown } | null,
): CompanyAssignmentPublicError {
  const message = typeof error?.message === 'string' ? error.message.trim() : '';

  if (domainCodes.has(message)) {
    return { code: message as CompanyAssignmentDomainCode, status: 409 };
  }
  if (error?.code === '23505') {
    return { code: 'ASSIGNMENT_CONFLICT', status: 409 };
  }
  return { code: 'INTERNAL', status: 500 };
}
