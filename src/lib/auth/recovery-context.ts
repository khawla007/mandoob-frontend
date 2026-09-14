import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { SensitiveRateLimitConfig } from '@/lib/rate-limit';

export const RECOVERY_CONTEXT_COOKIE_NAME = 'mandoob-recovery-context';
export const RECOVERY_CONTEXT_MAX_AGE_SECONDS = 10 * 60;

export const recoveryContextCookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: RECOVERY_CONTEXT_MAX_AGE_SECONDS,
};

function signature(userId: string, expiresAt: string, nonce: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(userId)
    .update('\0')
    .update(expiresAt)
    .update('\0')
    .update(nonce)
    .digest('base64url');
}

export function createRecoveryContextValue(
  userId: string,
  secret: string,
  now = Date.now(),
  nonce = randomBytes(18).toString('base64url'),
): string {
  const expiresAt = String(Math.floor(now / 1000) + RECOVERY_CONTEXT_MAX_AGE_SECONDS);
  return `${expiresAt}.${nonce}.${signature(userId, expiresAt, nonce, secret)}`;
}

export function isValidRecoveryContextValue(
  value: string | null | undefined,
  userId: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [expiresAt, nonce, suppliedSignature] = parts;
  if (!/^\d{10}$/u.test(expiresAt!) || !/^[A-Za-z0-9_-]{8,128}$/u.test(nonce!)) return false;
  const expiry = Number(expiresAt) * 1000;
  if (!Number.isSafeInteger(expiry) || expiry < now) return false;
  const expected = signature(userId, expiresAt!, nonce!, secret);
  const supplied = Buffer.from(suppliedSignature!, 'utf8');
  const correct = Buffer.from(expected, 'utf8');
  return supplied.length === correct.length && timingSafeEqual(supplied, correct);
}

export async function deleteRecoveryContextCookie(): Promise<void> {
  const store = await cookies();
  store.delete(RECOVERY_CONTEXT_COOKIE_NAME);
}

type RecoveryClaimConsumer = (
  config: SensitiveRateLimitConfig,
) => Promise<'allowed' | 'limited' | 'unavailable'>;

async function consumeRecoveryClaim(
  config: SensitiveRateLimitConfig,
): Promise<'allowed' | 'limited' | 'unavailable'> {
  const { consumeSensitiveRateLimit } = await import('@/lib/rate-limit');
  return consumeSensitiveRateLimit(config);
}

export async function claimRecoveryContext(
  value: string,
  secret: string,
  consume: RecoveryClaimConsumer = consumeRecoveryClaim,
): Promise<'allowed' | 'limited' | 'unavailable'> {
  const digest = createHmac('sha256', secret)
    .update('password-recovery-claim\0')
    .update(value)
    .digest('base64url');
  return consume({
    key: `password-recovery:${digest}`,
    capacity: 1,
    refillPerSec: 0,
    cost: 1,
    routeLabel: 'password-recovery-claim',
    correlationId: digest.slice(0, 16),
  });
}
