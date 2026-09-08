import { sharedSafeDestination } from '@/lib/auth/safe-redirect';

export type MfaFailureCategory =
  | 'invalidOrExpired'
  | 'expired'
  | 'rateLimited'
  | 'sessionExpired'
  | 'repairRequired'
  | 'cleanRollback'
  | 'challengeRequired'
  | 'failure';

export function sanitizeMfaCode(value: string): string {
  return value.replace(/\D/gu, '').slice(0, 8);
}

export function mfaFailureCategory(code: string | null | undefined): MfaFailureCategory {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'sessionExpired';
    case 'RATE_LIMITED':
      return 'rateLimited';
    case 'MFA_INVALID_CODE':
    case 'INVALID_INPUT':
      return 'invalidOrExpired';
    case 'MFA_CHALLENGE_FAILED':
      return 'expired';
    case 'MFA_ENROLL_REPAIR_REQUIRED':
    case 'MFA_RECOVERY_REPAIR_REQUIRED':
      return 'repairRequired';
    case 'MFA_ENROLL_FINALIZATION_FAILED':
      return 'cleanRollback';
    case 'AAL2_REQUIRED':
      return 'challengeRequired';
    default:
      return 'failure';
  }
}

export function mfaFactorDiscoveryCategory(error: unknown): 'sessionExpired' | 'failure' {
  if (!error || typeof error !== 'object') return 'failure';
  const candidate = error as { status?: unknown; code?: unknown };
  if (candidate.status === 401) return 'sessionExpired';
  if (candidate.code === 'session_not_found' || candidate.code === 'refresh_token_not_found') {
    return 'sessionExpired';
  }
  return 'failure';
}

export function mfaSuccessDestination(mode: 'totp' | 'recovery', rawNext: string | null): string {
  return mode === 'recovery' ? '/login' : sharedSafeDestination(rawNext);
}
