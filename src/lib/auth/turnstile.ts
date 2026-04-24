import 'server-only';
import { env } from '@/lib/env';

/**
 * Verify a Cloudflare Turnstile token server-side. In dev / when TURNSTILE_SECRET_KEY
 * is not configured, verification is a no-op returning true so flows are testable.
 */
export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // not configured -> skip
  if (!token) return false;
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const data = (await res.json()) as { success?: boolean };
  return Boolean(data.success);
}
