import 'server-only';
import type { ResolvedTapConfig } from '@/lib/payments/config';

export type TapCustomer = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneCountryCode?: string | null;
  phoneNumber?: string | null;
};

export type CreateChargeArgs = {
  config: ResolvedTapConfig;
  amountMinor: bigint | number;
  currency: string;
  description: string;
  statementDescriptor?: string;
  customer: TapCustomer;
  redirectUrl: string;
  postUrl: string;
  metadata?: Record<string, string>;
};

export type TapChargeResult =
  | { ok: true; chargeId: string; transactionUrl: string; raw: unknown }
  | { ok: false; error: string; retryable: boolean; status?: number; raw?: unknown };

export type TapRefundResult =
  | { ok: true; refundId: string; status: string; raw: unknown }
  | { ok: false; error: string; retryable: boolean; status?: number; raw?: unknown };

export async function createCharge(args: CreateChargeArgs): Promise<TapChargeResult> {
  const amount = minorToMajor(args.amountMinor, args.currency);
  const body = {
    amount,
    currency: args.currency,
    description: args.description,
    statement_descriptor: args.statementDescriptor ?? args.description.slice(0, 22),
    customer: {
      first_name: args.customer.firstName ?? undefined,
      last_name: args.customer.lastName ?? undefined,
      email: args.customer.email ?? undefined,
      phone:
        args.customer.phoneCountryCode && args.customer.phoneNumber
          ? {
              country_code: args.customer.phoneCountryCode,
              number: args.customer.phoneNumber,
            }
          : undefined,
    },
    source: { id: 'src_all' },
    redirect: { url: args.redirectUrl },
    post: { url: args.postUrl },
    metadata: args.metadata,
    merchant: args.config.merchantId ? { id: args.config.merchantId } : undefined,
  };

  const res = await tapFetch(args.config, '/v2/charges/', { method: 'POST', body });
  if (!res.ok) return res;
  const json = res.json as Record<string, unknown>;
  const chargeId = typeof json.id === 'string' ? json.id : null;
  const transaction = json.transaction as Record<string, unknown> | undefined;
  const transactionUrl = typeof transaction?.url === 'string' ? transaction.url : null;
  if (!chargeId || !transactionUrl) {
    return { ok: false, error: 'malformed Tap charge response', retryable: false, raw: json };
  }
  return { ok: true, chargeId, transactionUrl, raw: json };
}

export async function getCharge(
  chargeId: string,
  config: ResolvedTapConfig,
): Promise<TapChargeResult> {
  const res = await tapFetch(config, `/v2/charges/${encodeURIComponent(chargeId)}`, {
    method: 'GET',
  });
  if (!res.ok) return res;
  const json = res.json as Record<string, unknown>;
  const id = typeof json.id === 'string' ? json.id : null;
  const transaction = json.transaction as Record<string, unknown> | undefined;
  const transactionUrl = typeof transaction?.url === 'string' ? transaction.url : '';
  if (!id)
    return { ok: false, error: 'malformed Tap charge response', retryable: false, raw: json };
  return { ok: true, chargeId: id, transactionUrl, raw: json };
}

export async function createRefund(args: {
  config: ResolvedTapConfig;
  chargeId: string;
  amountMinor: bigint | number;
  currency: string;
  reason: string;
}): Promise<TapRefundResult> {
  const amount = minorToMajor(args.amountMinor, args.currency);
  const body = {
    charge_id: args.chargeId,
    amount,
    currency: args.currency,
    reason: 'requested_by_customer',
    description: args.reason,
  };
  const res = await tapFetch(args.config, '/v2/refunds/', { method: 'POST', body });
  if (!res.ok) return res;
  const json = res.json as Record<string, unknown>;
  const refundId = typeof json.id === 'string' ? json.id : null;
  const status = typeof json.status === 'string' ? json.status : 'PENDING';
  if (!refundId)
    return { ok: false, error: 'malformed Tap refund response', retryable: false, raw: json };
  return { ok: true, refundId, status, raw: json };
}

type TapFetchSuccess = { ok: true; json: unknown };
type TapFetchFailure = {
  ok: false;
  error: string;
  retryable: boolean;
  status?: number;
  raw?: unknown;
};

async function tapFetch(
  config: ResolvedTapConfig,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<TapFetchSuccess | TapFetchFailure> {
  const url = `${config.apiBase.replace(/\/$/, '')}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'network error';
    return { ok: false, error, retryable: true };
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const message = extractErrorMessage(parsed) ?? `Tap ${res.status}`;
    return {
      ok: false,
      error: message,
      retryable: res.status === 429 || res.status >= 500,
      status: res.status,
      raw: parsed,
    };
  }

  return { ok: true, json: parsed };
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const errors = (payload as { errors?: unknown }).errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (first && typeof first === 'object') {
      const description = (first as { description?: unknown }).description;
      if (typeof description === 'string') return description;
    }
  }
  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

// Tap charges expect the `amount` field as a decimal in the major unit
// (e.g. 12.50 AED, not 1250 fils). Convert from our internal minor-unit
// storage. AED has 2 decimals (the only currency we handle in v1) — keep
// the helper small and explicit; we'll widen the lookup table when we add
// JOD/KWD (3 decimals) in a later step.
const DECIMALS: Record<string, number> = {
  AED: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  SAR: 2,
};

export function minorToMajor(amountMinor: bigint | number, currency: string): string {
  const decimals = DECIMALS[currency.toUpperCase()] ?? 2;
  const asBig = typeof amountMinor === 'bigint' ? amountMinor : BigInt(Math.trunc(amountMinor));
  const divisor = BigInt(10) ** BigInt(decimals);
  const major = asBig / divisor;
  const remainder = asBig % divisor;
  if (decimals === 0) return major.toString();
  const remainderStr = remainder.toString().padStart(decimals, '0');
  return `${major.toString()}.${remainderStr}`;
}
