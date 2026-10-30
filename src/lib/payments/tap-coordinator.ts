import { createHmac, timingSafeEqual } from 'node:crypto';

export type DurableTapIntent = {
  operationId: string;
  effectKey: string;
  payloadHash: string;
  state: 'reserved' | 'attached' | 'reconciled' | 'failed';
  providerReference: string | null;
  redirectUrl: string | null;
  ownsEffect?: boolean;
  effectToken?: string | null;
  amountMinor: number;
  currency: string;
};

type Start = { operationId: string; payloadHash: string };
type Effect = {
  providerReference: string;
  redirectUrl: string | null;
  status?: 'pending' | 'succeeded' | 'failed';
};
type EffectResult =
  | ({ kind: 'created' } & Effect)
  | { kind: 'unknown' }
  | { kind: 'failed'; retryable: boolean; code?: string };
type Dependencies = {
  reserve(input: Start): Promise<DurableTapIntent>;
  createEffect(intent: DurableTapIntent): Promise<EffectResult>;
  lookupEffect(effectKey: string): Promise<Effect | null>;
  persistEffect(intent: DurableTapIntent, effect: Effect): Promise<DurableTapIntent>;
  reconcile(
    intent: DurableTapIntent,
    status?: 'pending' | 'succeeded' | 'failed',
  ): Promise<DurableTapIntent>;
  recordFailure?(intent: DurableTapIntent): Promise<void>;
};

export type CoordinatorResult =
  | { ok: true; redirectUrl: string | null; replayed: boolean }
  | { ok: false; code: 'OPERATION_REUSED' | 'PROVIDER_FAILED' | 'UNAVAILABLE'; retryable: boolean };

async function run(start: Start, deps: Dependencies, refund: boolean): Promise<CoordinatorResult> {
  let reserved: DurableTapIntent;
  try {
    reserved = await deps.reserve(start);
  } catch (error) {
    const reused =
      error instanceof Error &&
      (error.message.includes('OPERATION_REUSED') ||
        (error as Error & { code?: string }).code === 'OPERATION_REUSED');
    return { ok: false, code: reused ? 'OPERATION_REUSED' : 'UNAVAILABLE', retryable: !reused };
  }
  if (
    reserved.operationId !== start.operationId ||
    reserved.payloadHash !== start.payloadHash ||
    !Number.isSafeInteger(reserved.amountMinor) ||
    reserved.amountMinor <= 0 ||
    !/^[A-Z]{3}$/u.test(reserved.currency)
  )
    return { ok: false, code: 'OPERATION_REUSED', retryable: false };
  if (reserved.state === 'reconciled')
    return { ok: true, redirectUrl: reserved.redirectUrl, replayed: true };

  try {
    let effect: Effect | null = reserved.providerReference
      ? { providerReference: reserved.providerReference, redirectUrl: reserved.redirectUrl }
      : null;
    if (!effect) {
      effect = await deps.lookupEffect(reserved.effectKey);
      if (!effect && reserved.ownsEffect !== false) {
        const created = await deps.createEffect(reserved);
        if (created.kind === 'failed') {
          if (!created.retryable) await deps.recordFailure?.(reserved);
          return { ok: false, code: 'PROVIDER_FAILED', retryable: created.retryable };
        }
        effect = created.kind === 'unknown' ? await deps.lookupEffect(reserved.effectKey) : created;
      }
      if (!effect) return { ok: false, code: 'UNAVAILABLE', retryable: true };
    }
    const attached =
      reserved.state === 'attached' ? reserved : await deps.persistEffect(reserved, effect);
    if (
      attached.operationId !== reserved.operationId ||
      attached.effectKey !== reserved.effectKey ||
      attached.payloadHash !== reserved.payloadHash ||
      attached.amountMinor !== reserved.amountMinor ||
      attached.currency !== reserved.currency
    )
      throw new Error('durable intent changed');
    const status = refund ? (effect.status ?? 'pending') : undefined;
    const reconciled = await deps.reconcile(attached, status);
    return { ok: true, redirectUrl: reconciled.redirectUrl, replayed: false };
  } catch {
    return { ok: false, code: 'UNAVAILABLE', retryable: true };
  }
}

export const runTapCharge = (start: Start, deps: Dependencies) => run(start, deps, false);
export const runTapRefund = (start: Start, deps: Dependencies) => run(start, deps, true);

type RedirectState = { operationId: string; invoiceId: string; expiresAt: number };

export function createRedirectState(value: RedirectState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyRedirectState(
  value: string,
  secret: string,
  now = Date.now(),
): RedirectState | null {
  const [payload, supplied, extra] = value.split('.');
  if (!payload || !supplied || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(supplied, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RedirectState;
    if (
      !parsed.operationId ||
      !parsed.invoiceId ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt < now
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifyPaymentReturnState(
  value: string,
  secret: string,
  expected: { invoiceId: string; operationId: string; now?: number },
): boolean {
  const parsed = verifyRedirectState(value, secret, expected.now);
  return Boolean(
    parsed &&
    parsed.invoiceId === expected.invoiceId &&
    parsed.operationId === expected.operationId,
  );
}
