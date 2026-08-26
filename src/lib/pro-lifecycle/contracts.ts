export const PRO_CREDENTIAL_STATES = [
  'draft',
  'submitted',
  'under_review',
  'verified',
  'rejected',
  'expired',
  'revoked',
] as const;

export const PRO_CREDENTIAL_EVENTS = [
  'submitted',
  'review_started',
  'verified',
  'rejected',
  'expired',
  'revoked',
  'superseded',
] as const;

export const PRO_ASSIGNMENT_ELIGIBILITY_CODES = [
  'PRO_ACCOUNT_INACTIVE',
  'PRO_CREDENTIAL_MISSING',
  'PRO_CREDENTIAL_DRAFT',
  'PRO_CREDENTIAL_SUBMITTED',
  'PRO_CREDENTIAL_UNDER_REVIEW',
  'PRO_CREDENTIAL_REJECTED',
  'PRO_CREDENTIAL_EXPIRED',
  'PRO_CREDENTIAL_REVOKED',
  'PRO_ALREADY_ASSIGNED',
  'PRICING_TERMS_MISSING',
  'COMPENSATION_TERMS_MISSING',
  'COMPANY_INACTIVE',
  'COMPANY_ALREADY_ASSIGNED',
] as const;

export const PRO_TERM_KINDS = ['pricing', 'compensation'] as const;
export const PRO_TERM_MODELS = ['per_registration', 'retainer'] as const;
export const PRO_TERM_INTERVALS = ['monthly', 'annual'] as const;

export type ProCredentialState = (typeof PRO_CREDENTIAL_STATES)[number];
export type ProCredentialEvent = (typeof PRO_CREDENTIAL_EVENTS)[number];
export type ProAssignmentEligibilityCode = (typeof PRO_ASSIGNMENT_ELIGIBILITY_CODES)[number];
export type ProTermKind = (typeof PRO_TERM_KINDS)[number];
export type ProTermModel = (typeof PRO_TERM_MODELS)[number];

export type ProCredentialMask = {
  credentialId: string;
  type: 'pro_license';
  maskedIdentifier: string | null;
  issuingAuthority: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  state: ProCredentialState;
  version: number;
  evidenceCount: number;
  submittedAt: string | null;
  supersedesCredentialId: string | null;
};

export type ProAssignmentEligibility = {
  eligible: boolean;
  codes: ProAssignmentEligibilityCode[];
  verifiedCredentialId: string | null;
  pricingTermId: string | null;
  compensationTermId: string | null;
};

const ALLOWED_TRANSITIONS: Readonly<Record<ProCredentialState, readonly ProCredentialState[]>> = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['verified', 'rejected'],
  verified: ['expired', 'revoked'],
  rejected: [],
  expired: [],
  revoked: [],
};

export function isProCredentialTransitionAllowed(
  from: ProCredentialState,
  to: ProCredentialState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function maskProCredentialIdentifier(lastFour: string | null): string | null {
  if (lastFour === null) return null;
  if (!/^[A-Z0-9]{4}$/u.test(lastFour)) {
    throw new Error('Credential last four is invalid');
  }
  return `•••• ${lastFour}`;
}

export function isProCredentialUnexpiredAtDubaiDate(expiryDate: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(expiryDate) || Number.isNaN(now.getTime())) {
    throw new Error('Invalid credential expiry boundary');
  }
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const dubaiDate = `${part('year')}-${part('month')}-${part('day')}`;
  return expiryDate >= dubaiDate;
}
