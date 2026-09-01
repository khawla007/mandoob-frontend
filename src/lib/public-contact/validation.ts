import {
  CONTACT_LIMITS,
  CONTACT_SUBJECTS,
  type ContactFieldError,
  type ContactFieldErrorCode,
  type ContactFieldName,
  type ContactSubject,
  type ContactValidationResult,
  type RawContactPayload,
} from './contracts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const UAE_NUMBER_PATTERN = /^971(?:5[024568]\d{7}|[234679]\d{7})$/u;
const PHONE_DISPLAY_PATTERN = /^\+?[\d\s().-]+$/u;

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/gu, ' ');
const codePointLength = (value: string) => Array.from(value).length;

export function normalizeUaePhone(value: string): string | null {
  const input = value.trim();
  if (!input || codePointLength(input) > CONTACT_LIMITS.phoneMax) return null;
  if (!PHONE_DISPLAY_PATTERN.test(input)) return null;

  let digits = input.replace(/\D/gu, '');
  if (digits.startsWith('00971')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = `971${digits.slice(1)}`;
  } else if (!digits.startsWith('971')) {
    digits = `971${digits}`;
  }

  return UAE_NUMBER_PATTERN.test(digits) ? `+${digits}` : null;
}

export function validateContactSubmission(payload: RawContactPayload): ContactValidationResult {
  const fullName = normalizeWhitespace(payload.fullName);
  const email = normalizeWhitespace(payload.email).toLowerCase();
  const phoneInput = payload.phone.trim();
  const subjectInput = normalizeWhitespace(payload.subject);
  const message = normalizeWhitespace(payload.message);
  const errors: ContactFieldError[] = [];

  validateRequiredLength(
    errors,
    'fullName',
    fullName,
    CONTACT_LIMITS.fullNameMin,
    CONTACT_LIMITS.fullNameMax,
    'Full name',
  );

  if (!email) {
    addError(errors, 'email', 'required', 'Enter your email address.');
  } else if (codePointLength(email) > CONTACT_LIMITS.emailMax) {
    addError(errors, 'email', 'too_long', 'Email address is too long.');
  } else if (!EMAIL_PATTERN.test(email)) {
    addError(errors, 'email', 'invalid', 'Enter a valid email address.');
  }

  let phone: string | null = null;
  if (!phoneInput) {
    addError(errors, 'phone', 'required', 'Enter your UAE phone number.');
  } else if (codePointLength(phoneInput) > CONTACT_LIMITS.phoneMax) {
    addError(errors, 'phone', 'too_long', 'Phone number is too long.');
  } else {
    phone = normalizeUaePhone(phoneInput);
    if (!phone) {
      addError(errors, 'phone', 'invalid', 'Enter a valid UAE mobile or landline number.');
    }
  }

  const subject = CONTACT_SUBJECTS.includes(subjectInput as ContactSubject)
    ? (subjectInput as ContactSubject)
    : null;
  if (!subjectInput) {
    addError(errors, 'subject', 'required', 'Choose a subject.');
  } else if (!subject) {
    addError(errors, 'subject', 'invalid', 'Choose an available subject.');
  }

  validateRequiredLength(
    errors,
    'message',
    message,
    CONTACT_LIMITS.messageMin,
    CONTACT_LIMITS.messageMax,
    'Message',
  );

  if (payload.consent !== true) {
    addError(
      errors,
      'consent',
      'required',
      'Confirm that Mandoob may use these details to respond.',
    );
  }

  if (errors.length > 0 || !phone || !subject) return { ok: false, errors };

  return {
    ok: true,
    data: {
      fullName,
      email,
      phone,
      subject,
      message,
      consent: true,
    },
  };
}

function validateRequiredLength(
  errors: ContactFieldError[],
  field: 'fullName' | 'message',
  value: string,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (!value) {
    addError(errors, field, 'required', `Enter your ${label.toLowerCase()}.`);
  } else if (codePointLength(value) < minimum) {
    addError(errors, field, 'too_short', `${label} must be at least ${minimum} characters.`);
  } else if (codePointLength(value) > maximum) {
    addError(errors, field, 'too_long', `${label} must be ${maximum} characters or fewer.`);
  }
}

function addError(
  errors: ContactFieldError[],
  field: ContactFieldName,
  code: ContactFieldErrorCode,
  message: string,
) {
  errors.push({ field, code, message, href: `#contact-${field}` });
}
