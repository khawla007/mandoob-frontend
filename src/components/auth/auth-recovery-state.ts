const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const EMAIL_CONTEXT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function isAcceptedInviteToken(token: string): boolean {
  return INVITE_TOKEN.test(token);
}

export function isAcceptedEmailContext(email: string): boolean {
  return email.length <= 254 && EMAIL_CONTEXT.test(email);
}

export function validateNewPassword(password: string): Array<'lengthOrPolicy'> {
  return password.length >= 8 &&
    password.length <= 200 &&
    /[A-Z]/u.test(password) &&
    /[a-z]/u.test(password) &&
    /[^A-Za-z0-9]/u.test(password)
    ? []
    : ['lengthOrPolicy'];
}

export function sanitizeOtpDigits(value: string): string {
  return value.replace(/\D/gu, '').slice(0, 6);
}

export type InviteFailureCategory =
  | 'validation'
  | 'invalid'
  | 'expired'
  | 'rateLimited'
  | 'sessionRefreshRequired'
  | 'failure';

export function inviteFailureCategory(code: string | undefined): InviteFailureCategory {
  if (code === 'INVALID_INPUT') return 'validation';
  if (code === 'INVITE_INVALID') return 'invalid';
  if (code === 'INVITE_EXPIRED') return 'expired';
  if (code === 'RATE_LIMITED') return 'rateLimited';
  if (code === 'CSRF_REQUIRED' || code === 'CSRF_MISMATCH') return 'sessionRefreshRequired';
  return 'failure';
}

export type OtpFailureCategory =
  | 'incomplete'
  | 'invalidOrExpired'
  | 'rateLimited'
  | 'locked'
  | 'sessionRefreshRequired'
  | 'failure';

export function otpFailureCategory(code: string | undefined): OtpFailureCategory {
  if (code === 'INVALID_INPUT') return 'incomplete';
  if (code === 'INVALID_OTP') return 'invalidOrExpired';
  if (code === 'RATE_LIMITED') return 'rateLimited';
  if (code === 'FORBIDDEN') return 'locked';
  if (code === 'CSRF_REQUIRED' || code === 'CSRF_MISMATCH') return 'sessionRefreshRequired';
  return 'failure';
}

export type ForgotPasswordFailureCategory =
  | 'validation'
  | 'rateLimited'
  | 'sessionRefreshRequired'
  | 'transport';

export function forgotPasswordFailureCategory(
  code: string | undefined,
): ForgotPasswordFailureCategory {
  if (code === 'INVALID_INPUT') return 'validation';
  if (code === 'RATE_LIMITED') return 'rateLimited';
  if (code === 'CSRF_REQUIRED' || code === 'CSRF_MISMATCH') return 'sessionRefreshRequired';
  return 'transport';
}

export type ResetPasswordFailureCategory =
  | 'validation'
  | 'invalidOrExpired'
  | 'rateLimited'
  | 'sessionRefreshRequired'
  | 'failure';

export function resetPasswordFailureCategory(
  code: string | undefined,
): ResetPasswordFailureCategory {
  if (code === 'INVALID_INPUT') return 'validation';
  if (code === 'UNAUTHENTICATED' || code === 'RESET_CONTEXT_CONSUMED') {
    return 'invalidOrExpired';
  }
  if (code === 'RATE_LIMITED') return 'rateLimited';
  if (code === 'CSRF_REQUIRED' || code === 'CSRF_MISMATCH') return 'sessionRefreshRequired';
  return 'failure';
}
