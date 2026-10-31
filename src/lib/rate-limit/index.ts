import 'server-only';
import { randomUUID } from 'node:crypto';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type RateLimitConfig = {
  key: string;
  capacity: number;
  refillPerSec: number;
  cost?: number;
};

export type SensitiveRateLimitConfig = RateLimitConfig & {
  routeLabel: string;
  correlationId: string;
};

export type RateLimitDecision = 'allowed' | 'limited' | 'unavailable';
export type RateLimitPairDecision =
  | {
      first: Exclude<RateLimitDecision, 'unavailable'>;
      second: Exclude<RateLimitDecision, 'unavailable'>;
    }
  | 'unavailable';

export type SensitiveRateLimitDeps = {
  consume?: (config: RateLimitConfig) => Promise<{ data: unknown; error: unknown }>;
  log?: (...args: unknown[]) => void;
};

export type RateLimitPairDeps = {
  consume?: (
    first: RateLimitConfig,
    second: RateLimitConfig,
  ) => Promise<{ data: unknown; error: unknown }>;
  log?: (...args: unknown[]) => void;
};

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function rateLimitCorrelationId(
  supplied: string | null | undefined,
  generate: () => string = randomUUID,
): string {
  return supplied && CANONICAL_UUID.test(supplied) ? supplied : generate();
}

async function defaultConsume(config: RateLimitConfig) {
  const admin = createSupabaseServiceRoleClient();
  return admin.rpc('rate_limit_consume', {
    p_key: config.key,
    p_capacity: config.capacity,
    p_refill_per_sec: config.refillPerSec,
    p_cost: config.cost ?? 1,
  });
}

async function defaultConsumePair(first: RateLimitConfig, second: RateLimitConfig) {
  const admin = createSupabaseServiceRoleClient();
  return admin.rpc('rate_limit_consume_pair', {
    p_first_key: first.key,
    p_first_capacity: first.capacity,
    p_first_refill_per_sec: first.refillPerSec,
    p_first_cost: first.cost ?? 1,
    p_second_key: second.key,
    p_second_capacity: second.capacity,
    p_second_refill_per_sec: second.refillPerSec,
    p_second_cost: second.cost ?? 1,
  });
}

function safeLogUnavailable(
  cfg: SensitiveRateLimitConfig,
  log: (...args: unknown[]) => void = console.error,
) {
  try {
    log('rate-limit unavailable', {
      routeLabel: cfg.routeLabel,
      correlationId: cfg.correlationId,
    });
  } catch {
    // Diagnostics are best effort and must not weaken the fail-closed decision.
  }
}

function safeLogPairUnavailable(
  first: SensitiveRateLimitConfig,
  second: SensitiveRateLimitConfig,
  log: (...args: unknown[]) => void = console.error,
) {
  try {
    log('rate-limit pair unavailable', {
      routeLabels: [first.routeLabel, second.routeLabel],
      correlationId: first.correlationId,
    });
  } catch {
    // Diagnostics are best effort and must not weaken the fail-closed decision.
  }
}

export async function consumeRateLimitPairDecision(
  first: SensitiveRateLimitConfig,
  second: SensitiveRateLimitConfig,
  deps: RateLimitPairDeps = {},
): Promise<RateLimitPairDecision> {
  const consume = deps.consume ?? defaultConsumePair;
  try {
    const { data, error } = await consume(first, second);
    if (
      error ||
      !data ||
      typeof data !== 'object' ||
      typeof (data as { first_allowed?: unknown }).first_allowed !== 'boolean' ||
      typeof (data as { second_allowed?: unknown }).second_allowed !== 'boolean'
    ) {
      safeLogPairUnavailable(first, second, deps.log);
      return 'unavailable';
    }
    return {
      first: (data as { first_allowed: boolean }).first_allowed ? 'allowed' : 'limited',
      second: (data as { second_allowed: boolean }).second_allowed ? 'allowed' : 'limited',
    };
  } catch {
    safeLogPairUnavailable(first, second, deps.log);
    return 'unavailable';
  }
}

export async function consumeRateLimitDecision(
  cfg: SensitiveRateLimitConfig,
  deps: SensitiveRateLimitDeps = {},
): Promise<RateLimitDecision> {
  const consume = deps.consume ?? defaultConsume;
  try {
    const { data, error } = await consume(cfg);
    if (error || typeof data !== 'boolean') {
      safeLogUnavailable(cfg, deps.log);
      return 'unavailable';
    }
    return data ? 'allowed' : 'limited';
  } catch {
    safeLogUnavailable(cfg, deps.log);
    return 'unavailable';
  }
}

/**
 * Postgres token-bucket limiter. Interface abstracts over transport so we can
 * swap to Upstash/Redis later without touching callers.
 */
export async function consumeRateLimit(
  cfg: RateLimitConfig,
  deps: SensitiveRateLimitDeps = {},
): Promise<boolean> {
  return (
    (await consumeRateLimitDecision(
      { ...cfg, routeLabel: 'legacy', correlationId: 'none' },
      deps,
    )) === 'allowed'
  );
}

export async function consumeSensitiveRateLimit(
  cfg: SensitiveRateLimitConfig,
  deps: SensitiveRateLimitDeps = {},
): Promise<RateLimitDecision> {
  return consumeRateLimitDecision(cfg, deps);
}

export const RATE_LIMITS = {
  authLoginIp: { capacity: 10, refillPerSec: 10 / 60 }, // 10/min per IP
  authPublicIp: { capacity: 20, refillPerSec: 20 / 60 }, // 20/min public
  authedPerUser: { capacity: 100, refillPerSec: 100 / 60 }, // 100/min per user
} as const;

export const SENSITIVE_RATE_LIMITS = {
  credentialUpload: { capacity: 10, refillPerSec: 10 / 60 },
  credentialMutation: { capacity: 30, refillPerSec: 30 / 60 },
  credentialReview: { capacity: 30, refillPerSec: 30 / 60 },
  financialEffect: { capacity: 10, refillPerSec: 10 / 60 },
} as const;
