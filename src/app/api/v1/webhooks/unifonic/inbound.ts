import type { SmsInbound } from '../inbound-recording';

export type UnifonicPayload = {
  MessageID?: string | number;
  messageId?: string | number;
  Status?: string;
  From?: string;
  Body?: string;
  To?: string;
  Recipient?: string;
  Timestamp?: string | number;
  timestamp?: string | number;
};

export function parseUnifonicInboundCallback(
  payload: UnifonicPayload,
  rawBody: string,
): SmsInbound | null {
  const destinationKey = payload.To ?? payload.Recipient;
  const providerEventId = payload.MessageID ?? payload.messageId;
  const occurredAt = payload.Timestamp ?? payload.timestamp;
  if (
    payload.Status ||
    !destinationKey ||
    !payload.From ||
    payload.Body === undefined ||
    !providerEventId ||
    !occurredAt
  ) {
    return null;
  }
  return {
    destinationKey,
    fromPhone: payload.From,
    body: payload.Body,
    providerEventId: String(providerEventId),
    occurredAt: String(occurredAt),
    rawPayload: rawBody,
  };
}
