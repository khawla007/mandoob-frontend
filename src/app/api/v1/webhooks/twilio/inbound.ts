import type { SmsInbound } from '../inbound-recording';

export function parseTwilioInboundCallback(rawBody: string): SmsInbound | null {
  const params = parseFormBody(rawBody);
  const providerEventId = params.MessageSid ?? params.SmsSid;
  const occurredAt = params.Timestamp ?? params.DateCreated;
  if (!isTwilioInboundCallback(params) || !providerEventId || !occurredAt) {
    return null;
  }
  return {
    destinationKey: params.To,
    fromPhone: params.From,
    body: params.Body,
    providerEventId,
    occurredAt,
    rawPayload: rawBody,
  };
}

export function twilioInboundUnavailableCode(
  rawBody: string,
  enabled: boolean,
): 'INBOUND_DISABLED' | 'TIMESTAMP_UNSUPPORTED' | null {
  const params = parseFormBody(rawBody);
  if (!isTwilioInboundCallback(params)) return null;
  if (!enabled) return 'INBOUND_DISABLED';
  if (!(params.Timestamp ?? params.DateCreated)) return 'TIMESTAMP_UNSUPPORTED';
  return null;
}

export function isTwilioInboundCallback(params: Record<string, string>): boolean {
  const status = (params.MessageStatus ?? params.SmsStatus)?.toLowerCase();
  return Boolean(
    (!status || status === 'received') &&
    params.To &&
    params.From &&
    params.Body !== undefined &&
    (params.MessageSid ?? params.SmsSid),
  );
}

export function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) out[key] = value;
  return out;
}
