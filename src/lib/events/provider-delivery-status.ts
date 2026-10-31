export type DeliveryStatusOutcome = 'applied' | 'replayed' | 'stale' | 'unknown' | 'not_found';

type RpcResult = { data: unknown; error: unknown };

export type ProviderDeliveryStatusRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

export type ProviderDeliveryStatusInput = {
  channel: 'sms' | 'whatsapp';
  provider: 'twilio' | 'unifonic' | 'whatsapp';
  providerMessageId: string;
  providerStatus: string;
  providerOccurredAt?: string | number | null;
  safeErrorCode?: string | number | null;
};

const OUTCOMES = new Set<DeliveryStatusOutcome>([
  'applied',
  'replayed',
  'stale',
  'unknown',
  'not_found',
]);
const SAFE_ERROR_CODE = /^[A-Za-z0-9_.:-]{1,64}$/u;

export class ProviderDeliveryStatusUnavailableError extends Error {
  constructor() {
    super('DELIVERY_STATUS_UNAVAILABLE');
    this.name = 'ProviderDeliveryStatusUnavailableError';
  }
}

export async function applyProviderDeliveryStatus(
  client: ProviderDeliveryStatusRpcClient,
  input: ProviderDeliveryStatusInput,
): Promise<DeliveryStatusOutcome> {
  let result: unknown;
  try {
    result = await client.rpc('apply_provider_delivery_status', {
      p_channel: input.channel,
      p_provider: input.provider,
      p_provider_message_id: input.providerMessageId,
      p_provider_status: input.providerStatus,
      p_provider_occurred_at: normalizeProviderTimestamp(input.providerOccurredAt),
      p_safe_error_code: normalizeSafeErrorCode(input.safeErrorCode),
    });
  } catch {
    throw new ProviderDeliveryStatusUnavailableError();
  }

  if (!isRecord(result) || result.error || !isRecord(result.data)) {
    throw new ProviderDeliveryStatusUnavailableError();
  }
  const outcome = result.data.outcome;
  if (typeof outcome !== 'string' || !OUTCOMES.has(outcome as DeliveryStatusOutcome)) {
    throw new ProviderDeliveryStatusUnavailableError();
  }
  return outcome as DeliveryStatusOutcome;
}

function normalizeProviderTimestamp(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;

  const numericSeconds = /^\d{1,12}(?:\.\d{1,3})?$/u.test(text) ? Number(text) : null;
  const milliseconds = numericSeconds === null ? Date.parse(text) : numericSeconds * 1000;
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSafeErrorCode(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return null;
  const code = String(value).trim();
  return SAFE_ERROR_CODE.test(code) ? code : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
