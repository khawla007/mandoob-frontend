import 'server-only';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'mandoob-csrf';
const HEADER_NAME = 'x-mandoob-csrf';
const MAX_AGE = 60 * 60 * 24; // 24h

/**
 * Double-submit CSRF: a random token is issued as a SameSite=Lax cookie and must
 * be echoed in the x-mandoob-csrf header on every state-changing request.
 * SameSite alone is incomplete defense; the custom header is mandated by CLAUDE.md §6.
 */
export async function issueCsrfCookie(): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: false, // client needs to read it
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
  return token;
}

export async function getCsrfToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export function assertCsrf(request: Request, cookieToken: string | null): boolean {
  const headerToken = request.headers.get(HEADER_NAME);
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const CSRF_COOKIE_NAME = COOKIE_NAME;
export const CSRF_HEADER_NAME = HEADER_NAME;
