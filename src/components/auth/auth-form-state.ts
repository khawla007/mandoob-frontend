import { z } from 'zod';
import { sharedSafeDestination } from '@/lib/auth/safe-redirect';

export type AuthValidationMessages = {
  fullNameRequired: string;
  invalidEmail: string;
  invalidPhone: string;
  passwordRequired: string;
  passwordLength: string;
  passwordUppercase: string;
  passwordLowercase: string;
  passwordSpecial: string;
  confirmPasswordRequired: string;
  passwordMismatch: string;
  consentRequired: string;
};

export function createLoginFormSchema(messages: AuthValidationMessages) {
  return z.object({
    email: z.string().email(messages.invalidEmail).max(254, messages.invalidEmail),
    password: z.string().min(1, messages.passwordRequired).max(200, messages.passwordRequired),
    rememberMe: z.boolean(),
  });
}

export function createRegistrationFormSchema(messages: AuthValidationMessages) {
  return z
    .object({
      fullName: z.string().trim().min(1, messages.fullNameRequired).max(200),
      email: z.string().email(messages.invalidEmail).max(254, messages.invalidEmail),
      phone: z
        .string()
        .refine((value) => value === '' || /^\+[1-9]\d{7,14}$/u.test(value), messages.invalidPhone),
      password: z
        .string()
        .min(8, messages.passwordLength)
        .max(200)
        .regex(/[A-Z]/, messages.passwordUppercase)
        .regex(/[a-z]/, messages.passwordLowercase)
        .regex(/[^A-Za-z0-9]/, messages.passwordSpecial),
      confirmPassword: z.string().min(1, messages.confirmPasswordRequired),
      consentAccepted: z.boolean().refine((value) => value, { message: messages.consentRequired }),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ['confirmPassword'],
      message: messages.passwordMismatch,
    });
}

export type RegistrationFormValues = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  consentAccepted: boolean;
};

export function buildRegistrationPayload(values: RegistrationFormValues) {
  return {
    email: values.email,
    password: values.password,
    confirmPassword: values.confirmPassword,
    fullName: values.fullName,
    phone: values.phone || undefined,
    consentAccepted: values.consentAccepted,
    policyVersion: 'v1' as const,
  };
}

export function maskEmailAddress(email: string): string {
  const match = /^([^@]+)@([^@.]+)(\..+)$/u.exec(email);
  if (!match) return '•'.repeat(email.length);
  const [, local, domain, suffix] = match;
  const maskPart = (part: string) =>
    part.length === 1 ? '•' : `${part[0]}${'•'.repeat(part.length - 1)}`;
  return `${maskPart(local!)}@${maskPart(domain!)}${suffix}`;
}

export type SubmissionLatch = { current: boolean };

export function claimAuthSubmission(latch: SubmissionLatch): boolean {
  if (latch.current) return false;
  latch.current = true;
  return true;
}

export function releaseAuthSubmission(latch: SubmissionLatch): void {
  latch.current = false;
}

export type LoginFailureCategory =
  | 'validation'
  | 'invalidCredentials'
  | 'rateLimited'
  | 'authorizationUnavailable'
  | 'sessionRefreshRequired'
  | 'unexpected';

export function loginFailureCategory(code: string | undefined): LoginFailureCategory {
  if (code === 'INVALID_INPUT') return 'validation';
  if (code === 'INVALID_CREDENTIALS') return 'invalidCredentials';
  if (code === 'RATE_LIMITED') return 'rateLimited';
  if (code === 'AUTHORIZATION_UNAVAILABLE') return 'authorizationUnavailable';
  if (code === 'CSRF_REQUIRED' || code === 'CSRF_MISMATCH') return 'sessionRefreshRequired';
  return 'unexpected';
}

export function loginSuccessDestination(serverRedirect: string | null | undefined): string {
  return sharedSafeDestination(serverRedirect);
}

export type RegistrationFailureCategory =
  | 'validation'
  | 'rateLimited'
  | 'sessionRefreshRequired'
  | 'humanVerificationFailed'
  | 'duplicateSafe'
  | 'verificationDeliveryFailed'
  | 'unexpected';

export function registrationFailureCategory(code: string | undefined): RegistrationFailureCategory {
  if (code === 'INVALID_INPUT') return 'validation';
  if (code === 'RATE_LIMITED') return 'rateLimited';
  if (code === 'CSRF_REQUIRED' || code === 'CSRF_MISMATCH') return 'sessionRefreshRequired';
  if (code === 'TURNSTILE_REQUIRED' || code === 'TURNSTILE_FAILED') {
    return 'humanVerificationFailed';
  }
  if (code === 'USERNAME_TAKEN' || code === 'REGISTRATION_FAILED') return 'duplicateSafe';
  if (code === 'OTP_GENERATION_FAILED' || code === 'EMAIL_SEND_FAILED') {
    return 'verificationDeliveryFailed';
  }
  return 'unexpected';
}
