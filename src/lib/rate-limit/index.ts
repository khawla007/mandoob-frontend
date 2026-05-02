import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type RateLimitConfig = {
  key: string;
  capacity: number;
  refillPerSec: number;
  cost?: number;
};

/**
 * Postgres token-bucket limiter. Interface abstracts over transport so we can
 * swap to Upstash/Redis later without touching callers.
 */
export async function consumeRateLimit(cfg: RateLimitConfig): Promise<boolean> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.rpc('rate_limit_consume', {
    p_key: cfg.key,
    p_capacity: cfg.capacity,
    p_refill_per_sec: cfg.refillPerSec,
    p_cost: cfg.cost ?? 1,
  });
  if (error) {
    // Fail-open on infra errors; log. Alternative (fail-closed) rejects all
    // traffic on DB hiccups and is worse for user experience.
    console.error('rate-limit rpc failed', error);
    return true;
  }
  return data === true;
}

export const RATE_LIMITS = {
  authLoginIp: { capacity: 10, refillPerSec: 10 / 60 }, // 10/min per IP
  authPublicIp: { capacity: 20, refillPerSec: 20 / 60 }, // 20/min public
  authedPerUser: { capacity: 100, refillPerSec: 100 / 60 }, // 100/min per user
} as const;
