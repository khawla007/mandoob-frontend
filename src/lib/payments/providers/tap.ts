import 'server-only';
import type { ResolvedTapConfig } from '@/lib/payments/config';
import { tapCurrencyExponent, tapMajorToMinor } from '@/lib/payments/signature';

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
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

export type TapChargeResult =
  | {
      ok: true;
      chargeId: string;
      transactionUrl: string;
      status: string;
      amountMinor: number;
      currency: string;
      merchantId: string | null;
    }
  | { ok: false; error: string; retryable: boolean; status?: number };

export type TapRefundResult =
  | { ok: true; refundId: string; status: string; merchantId: string | null }
  | { ok: false; error: string; retryable: boolean; status?: number };

export type TapRefundState = 'pending' | 'succeeded' | 'failed';

export function mapTapRefundStatus(status: string): TapRefundState {
  switch (status.trim().toUpperCase()) {
    case 'REFUNDED':
      return 'succeeded';
    case 'PENDING':
    case 'ACCEPTED':
    case 'IN_PROGRESS':
    case 'UNKNOWN':
      return 'pending';
    case 'FAILED':
    case 'CANCELLED':
    case 'DECLINED':
    case 'REJECTED':
    case 'RESTRICTED':
    case 'TIMED_OUT':
    case 'TIMEDOUT':
    case 'CANCELED':
      return 'failed';
    default:
      return 'pending';
  }
}

export async function createCharge(
  args: CreateChargeArgs,
  options: TapRequestOptions = {},
): Promise<TapChargeResult> {
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
    reference: { idempotent: requireEffectKey(args.idempotencyKey) },
    metadata: { ...args.metadata, effect_key: requireEffectKey(args.idempotencyKey) },
    merchant: args.config.merchantId ? { id: args.config.merchantId } : undefined,
  };

  const res = await tapFetch(
    args.config,
    '/v2/charges/',
    {
      method: 'POST',
      body,
      idempotencyKey: requireEffectKey(args.idempotencyKey),
    },
    options,
  );
  if (!res.ok) return res;
  const json = res.json as Record<string, unknown>;
  const chargeId = typeof json.id === 'string' ? json.id : null;
  const transaction = json.transaction as Record<string, unknown> | undefined;
  const transactionUrl = typeof transaction?.url === 'string' ? transaction.url : null;
  const normalized = normalizeCharge(json);
  if (!chargeId || !transactionUrl || !normalized || !isAllowedTapRedirectUrl(transactionUrl))
    return { ok: false, error: 'invalid provider response', retryable: false };
  return { ok: true, chargeId, transactionUrl, ...normalized, merchantId: merchantId(json) };
}

export async function getCharge(
  chargeId: string,
  config: ResolvedTapConfig,
  options: TapRequestOptions = {},
): Promise<TapChargeResult> {
  const res = await tapFetch(
    config,
    `/v2/charges/${encodeURIComponent(chargeId)}`,
    {
      method: 'GET',
    },
    options,
  );
  if (!res.ok) return res;
  const json = res.json as Record<string, unknown>;
  const id = typeof json.id === 'string' ? json.id : null;
  const transaction = json.transaction as Record<string, unknown> | undefined;
  const transactionUrl = typeof transaction?.url === 'string' ? transaction.url : '';
  const normalized = normalizeCharge(json);
  if (!id || !normalized)
    return { ok: false, error: 'invalid provider response', retryable: false };
  return { ok: true, chargeId: id, transactionUrl, ...normalized, merchantId: merchantId(json) };
}

export async function lookupChargeByEffectKey(
  effectKey: string,
  config: ResolvedTapConfig,
  options: TapRequestOptions = {},
): Promise<TapChargeResult> {
  const res = await tapFetch(
    config,
    '/v2/charges/list',
    {
      method: 'POST',
      body: { limit: 1, metadata: { effect_key: requireEffectKey(effectKey) } },
    },
    options,
  );
  if (!res.ok) return res;
  const root = res.json as Record<string, unknown>;
  const charges = Array.isArray(root.charges) ? root.charges : [];
  const json = charges[0] as Record<string, unknown> | undefined;
  if (!json) return { ok: false, error: 'provider effect not found', retryable: true };
  const chargeId = typeof json.id === 'string' ? json.id : null;
  const transaction = json.transaction as Record<string, unknown> | undefined;
  const transactionUrl = typeof transaction?.url === 'string' ? transaction.url : '';
  const normalized = normalizeCharge(json);
  if (!chargeId || !normalized || !transactionUrl || !isAllowedTapRedirectUrl(transactionUrl))
    return { ok: false, error: 'invalid provider response', retryable: false };
  return { ok: true, chargeId, transactionUrl, ...normalized, merchantId: merchantId(json) };
}

export async function createRefund(
  args: {
    config: ResolvedTapConfig;
    chargeId: string;
    amountMinor: bigint | number;
    currency: string;
    reason: string;
    idempotencyKey: string;
  },
  options: TapRequestOptions = {},
): Promise<TapRefundResult> {
  const amount = minorToMajor(args.amountMinor, args.currency);
  const body = {
    charge_id: args.chargeId,
    amount,
    currency: args.currency,
    reason: 'requested_by_customer',
    description: args.reason,
    reference: { idempotent: requireEffectKey(args.idempotencyKey) },
  };
  const res = await tapFetch(
    args.config,
    '/v2/refunds/',
    {
      method: 'POST',
      body,
      idempotencyKey: requireEffectKey(args.idempotencyKey),
    },
    options,
  );
  if (!res.ok) return res;
  const json = res.json as Record<string, unknown>;
  const refundId = typeof json.id === 'string' ? json.id : null;
  const status = typeof json.status === 'string' ? json.status : 'PENDING';
  if (!refundId) return { ok: false, error: 'invalid provider response', retryable: false };
  return { ok: true, refundId, status, merchantId: merchantId(json) };
}

export async function getRefund(
  refundId: string,
  config: ResolvedTapConfig,
  options: TapRequestOptions = {},
): Promise<TapRefundResult> {
  const res = await tapFetch(
    config,
    `/v2/refunds/${encodeURIComponent(refundId)}`,
    {
      method: 'GET',
    },
    options,
  );
  if (!res.ok) return res;
  const json = res.json as Record<string, unknown>;
  const id = typeof json.id === 'string' ? json.id : null;
  const status = typeof json.status === 'string' ? json.status : 'PENDING';
  if (!id) {
    return { ok: false, error: 'invalid provider response', retryable: false };
  }
  return { ok: true, refundId: id, status, merchantId: merchantId(json) };
}

export async function lookupRefundByEffectKey(
  effectKey: string,
  config: ResolvedTapConfig,
  options: TapRequestOptions = {},
): Promise<TapRefundResult> {
  const res = await tapFetch(
    config,
    '/v2/refunds/list',
    {
      method: 'POST',
      body: { limit: 1, reference: { idempotent: requireEffectKey(effectKey) } },
    },
    options,
  );
  if (!res.ok) return res;
  const root = res.json as Record<string, unknown>;
  const refunds = Array.isArray(root.refunds) ? root.refunds : [];
  const json = refunds[0] as Record<string, unknown> | undefined;
  if (!json) return { ok: false, error: 'provider effect not found', retryable: true };
  const refundId = typeof json.id === 'string' ? json.id : null;
  const status = typeof json.status === 'string' ? json.status : 'PENDING';
  if (!refundId) return { ok: false, error: 'invalid provider response', retryable: false };
  return { ok: true, refundId, status, merchantId: merchantId(json) };
}

type TapFetchSuccess = { ok: true; json: unknown };
type TapFetchFailure = {
  ok: false;
  error: string;
  retryable: boolean;
  status?: number;
};

async function tapFetch(
  config: ResolvedTapConfig,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string },
  options: TapRequestOptions = {},
): Promise<TapFetchSuccess | TapFetchFailure> {
  if (!isAllowedTapApiBase(config.apiBase, process.env.NODE_ENV))
    return { ok: false, error: 'provider unavailable', retryable: false };
  const url = `${config.apiBase.replace(/\/$/, '')}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  let res: Response;
  try {
    res = await (options.fetchImpl ?? fetch)(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    return { ok: false, error: 'provider unavailable', retryable: true };
  } finally {
    clearTimeout(timeout);
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      error:
        res.status >= 500 || res.status === 429
          ? 'provider unavailable'
          : 'provider rejected request',
      retryable: res.status === 429 || res.status >= 500,
      status: res.status,
    };
  }

  return { ok: true, json: parsed };
}

function requireEffectKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 255) throw new Error('persisted provider effect key required');
  return key;
}

function normalizeCharge(json: Record<string, unknown>) {
  const status = typeof json.status === 'string' ? json.status.toUpperCase() : null;
  const currency = typeof json.currency === 'string' ? json.currency.toUpperCase() : null;
  const amount =
    typeof json.amount === 'number' || typeof json.amount === 'string' ? json.amount : null;
  if (!status || !currency || !/^[A-Z]{3}$/u.test(currency) || amount === null) return null;
  const amountMinor = tapMajorToMinor(amount, currency);
  if (amountMinor === null || amountMinor < 0) return null;
  return { status, amountMinor, currency };
}

function merchantId(json: Record<string, unknown>): string | null {
  const merchant = json.merchant as Record<string, unknown> | undefined;
  return typeof merchant?.id === 'string' ? merchant.id : null;
}

// Tap charges expect the `amount` field as a decimal in the major unit
// (e.g. 12.50 AED, not 1250 fils). Convert from our internal minor-unit
// storage. AED has 2 decimals (the only currency we handle in v1) — keep
// the helper small and explicit; we'll widen the lookup table when we add
// JOD/KWD (3 decimals) in a later step.
export function minorToMajor(amountMinor: bigint | number, currency: string): string {
  const decimals = tapCurrencyExponent(currency);
  const asBig = typeof amountMinor === 'bigint' ? amountMinor : BigInt(Math.trunc(amountMinor));
  const divisor = BigInt(10) ** BigInt(decimals);
  const major = asBig / divisor;
  const remainder = asBig % divisor;
  if (decimals === 0) return major.toString();
  const remainderStr = remainder.toString().padStart(decimals, '0');
  return `${major.toString()}.${remainderStr}`;
}

export type TapRequestOptions = { timeoutMs?: number; fetchImpl?: typeof fetch };

export function isAllowedTapApiBase(value: string, nodeEnv = process.env.NODE_ENV): boolean {
  try {
    const url = new URL(value);
    if (nodeEnv === 'production')
      return url.href === 'https://api.tap.company/' && !url.username && !url.password;
    return (
      (url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isAllowedTapRedirectUrl(value: string, nodeEnv = process.env.NODE_ENV): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (nodeEnv !== 'production') return true;
    const configured = (process.env.TAP_REDIRECT_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    return ['checkout.tap.company', ...configured].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
