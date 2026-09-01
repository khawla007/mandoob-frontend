export const CONTACT_SUBJECTS = [
  'company_setup',
  'cost_estimate',
  'document_requirements',
  'visa_immigration',
  'banking_guidance',
  'license_renewal',
  'other',
] as const;

export const CONTACT_LIMITS = {
  fullNameMin: 2,
  fullNameMax: 100,
  emailMax: 254,
  phoneMax: 32,
  messageMin: 10,
  messageMax: 2_000,
} as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];
export type ContactFieldName = 'fullName' | 'email' | 'phone' | 'subject' | 'message' | 'consent';
export type ContactFieldErrorCode = 'required' | 'invalid' | 'too_short' | 'too_long';

export type RawContactPayload = {
  fullName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  consent: boolean;
};

export type NormalizedContactPayload = {
  fullName: string;
  email: string;
  phone: string;
  subject: ContactSubject;
  message: string;
  consent: true;
};

export type ContactFieldError = {
  field: ContactFieldName;
  code: ContactFieldErrorCode;
  message: string;
  href: `#contact-${ContactFieldName}`;
};

export type ContactValidationResult =
  | { ok: true; data: NormalizedContactPayload }
  | { ok: false; errors: ContactFieldError[] };

type ContactResultBase = {
  sent: boolean;
  message: string;
  synthetic?: true;
  notice?: string;
};

export type ContactSubmissionResult =
  | (ContactResultBase & { status: 'success' })
  | (ContactResultBase & { status: 'duplicate' })
  | (ContactResultBase & { status: 'rate_limited'; retryAfterSeconds: number })
  | (ContactResultBase & { status: 'failure'; retryable: boolean })
  | (ContactResultBase & { status: 'unavailable' });

export type ContactAdapter = {
  submit(payload: NormalizedContactPayload): Promise<ContactSubmissionResult>;
};
