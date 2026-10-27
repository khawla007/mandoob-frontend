import { createHash } from 'node:crypto';
import {
  canonicalTapAmount,
  normalizeTapCreated,
  tapMajorToMinor,
  verifyTapHashstring,
  type TapHashstringFields,
} from './signature';

type TapPayload = {
  id?: string;
  event_id?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  merchant?: { id?: string };
  metadata?: { account_id?: string };
  reference?: { gateway?: string | null; payment?: string | null };
  transaction?: { created?: string | number | null };
};

export type TapWebhookEvent = {
  eventId: string;
  chargeId: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  status: string;
  occurredAt?: string;
  metadataAccountId?: string | null;
};

type Dependencies = {
  resolveDestination(destination: string): Promise<{ accountId: string; secret: string } | null>;
  verify(rawBody: Uint8Array, signature: string, secret: string): boolean;
  parse(rawBody: Uint8Array): TapWebhookEvent;
  reserveEvent(
    input: TapWebhookEvent & { bodyHash: string },
  ): Promise<{ reserved: true; token: string; claimId?: string } | { reserved: false }>;
  reconcile(
    input: TapWebhookEvent & { token: string; claimId?: string },
  ): Promise<'updated' | 'duplicate' | 'stale' | 'fenced' | 'mismatch'>;
};

export async function processTapWebhook(
  request: { rawBody: Uint8Array; signature: string; destination: string },
  deps: Dependencies,
): Promise<{ accepted: true }> {
  try {
    const destination = await deps.resolveDestination(request.destination);
    if (!destination || !deps.verify(request.rawBody, request.signature, destination.secret))
      return { accepted: true };
    const event = deps.parse(request.rawBody);
    if (event.accountId !== destination.accountId) return { accepted: true };
    if (event.metadataAccountId && event.metadataAccountId !== destination.accountId)
      return { accepted: true };
    const claim = await deps.reserveEvent({
      ...event,
      bodyHash: createHash('sha256').update(request.rawBody).digest('hex'),
    });
    if (!claim.reserved) return { accepted: true };
    await deps.reconcile({ ...event, token: claim.token, claimId: claim.claimId });
  } catch {
    // A uniform acknowledgment prevents destination, signature, and ownership oracles.
  }
  return { accepted: true };
}

export function verifyTapWebhookPayload(
  bytes: Uint8Array,
  signature: string,
  secret: string,
): boolean {
  const payload = parseTapPayload(bytes);
  const fields = payload && extractTapHashstringFields(payload);
  return Boolean(fields && verifyTapHashstring(fields, signature, secret));
}

export function normalizeTapWebhookPayload(
  bytes: Uint8Array,
  eventHeader: string | null,
): TapWebhookEvent {
  const payload = parseTapPayload(bytes);
  const chargeId = payload?.id ?? '';
  const status = payload?.status?.toUpperCase() ?? '';
  const created = String(payload?.transaction?.created ?? '');
  if (!payload || !chargeId || !status || payload.amount == null || !payload.currency)
    throw new Error('invalid webhook');
  const amountMinor = tapMajorToMinor(payload.amount, payload.currency);
  if (amountMinor === null || amountMinor < 0) throw new Error('invalid amount');
  const occurredAt = normalizeTapCreated(payload.transaction?.created ?? '');
  if (!occurredAt) throw new Error('invalid provider time');
  return {
    eventId: eventHeader || payload.event_id || `${chargeId}:${status}:${created}`,
    chargeId,
    accountId: payload.merchant?.id ?? '',
    metadataAccountId: payload.metadata?.account_id ?? null,
    amountMinor,
    currency: payload.currency.toUpperCase(),
    status,
    occurredAt,
  };
}

function parseTapPayload(bytes: Uint8Array): TapPayload | null {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as TapPayload;
  } catch {
    return null;
  }
}

function extractTapHashstringFields(payload: TapPayload): TapHashstringFields | null {
  if (
    !payload.id ||
    payload.amount == null ||
    !payload.currency ||
    !payload.status ||
    payload.transaction?.created == null
  )
    return null;
  const amount = canonicalTapAmount(payload.amount, payload.currency);
  if (!amount) return null;
  return {
    id: payload.id,
    amount,
    currency: payload.currency,
    gatewayReference: payload.reference?.gateway ?? '',
    paymentReference: payload.reference?.payment ?? '',
    status: payload.status,
    created: String(payload.transaction.created),
  };
}
