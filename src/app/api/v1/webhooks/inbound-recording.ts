import { createHash } from 'node:crypto';
import { recordInboundConsentKeyword } from '@/lib/comms/consent';
import { routeInboundReplyToLeadSafely } from '@/lib/data/lead-reply-routing';
import { hashDestinationKey, isWebhookTimestampWithinTolerance } from '@/lib/events/contracts';
import { enqueueSms } from '@/lib/sms/send';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { enqueueWhatsApp } from '@/lib/whatsapp/send';

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

export type WhatsAppInboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

type SmsInbound = {
  destinationKey: string;
  fromPhone: string;
  body: string;
  providerEventId: string;
  occurredAt: string;
  rawPayload: string;
};

type InboundReservation = {
  tenantId: string;
};

function hashOpaque(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeProviderTimestamp(value: string): string | null {
  const trimmed = value.trim();
  const timestampMs = /^\d{10}$/.test(trimmed) ? Number(trimmed) * 1000 : Date.parse(trimmed);
  if (!Number.isFinite(timestampMs)) return null;
  const normalized = new Date(timestampMs).toISOString();
  return isWebhookTimestampWithinTolerance(normalized) ? normalized : null;
}

async function reserveInbound(
  supabase: Supa,
  provider: 'twilio' | 'unifonic' | 'whatsapp',
  destinationKey: string,
  providerEventId: string,
  rawPayload: string,
  providerTimestamp: string,
): Promise<InboundReservation | null> {
  const occurredAt = normalizeProviderTimestamp(providerTimestamp);
  if (!occurredAt || !providerEventId || !rawPayload) return null;

  let destinationKeyHash: string;
  try {
    destinationKeyHash = hashDestinationKey(provider, destinationKey);
  } catch {
    return null;
  }

  const { data, error } = await supabase.rpc('reserve_inbound_webhook', {
    p_provider: provider,
    p_destination_key_hash: destinationKeyHash,
    p_provider_event_id_hash: hashOpaque(providerEventId),
    p_payload_hash: hashOpaque(rawPayload),
    p_occurred_at: occurredAt,
    p_signature_verified: true,
  });
  if (error) return null;
  const row = data?.[0];
  if (!row || typeof row.tenant_id !== 'string') return null;
  return { tenantId: row.tenant_id };
}

async function recordSmsInbound(
  supabase: Supa,
  provider: 'twilio' | 'unifonic',
  input: SmsInbound,
): Promise<void> {
  const reservation = await reserveInbound(
    supabase,
    provider,
    input.destinationKey,
    input.providerEventId,
    input.rawPayload,
    input.occurredAt,
  );
  if (!reservation) return;

  const { data: inboxRow, error: inboxError } = await supabase
    .from('sms_inbox')
    .insert({
      tenant_id: reservation.tenantId,
      from_phone: input.fromPhone,
      body: input.body,
      provider_message_id: input.providerEventId,
    })
    .select('id, received_at')
    .single();
  if (inboxError) return;

  const action = await recordInboundConsentKeyword({
    supabase,
    phoneE164: input.fromPhone,
    channel: 'sms',
    body: input.body,
    inboundMessageId: input.providerEventId,
  });
  if (action) {
    await enqueueSms({
      tenantId: reservation.tenantId,
      templateId: 'opt-out-confirmation',
      toPhone: input.fromPhone,
      input: {},
    });
  }
  await routeInboundReplyToLeadSafely(
    {
      tenantId: reservation.tenantId,
      channel: 'sms',
      inboxId: inboxRow.id,
      fromPhone: input.fromPhone,
      body: input.body,
      providerMessageId: input.providerEventId,
      receivedAt: inboxRow.received_at,
    },
    { supabase },
  );
}

export function recordTwilioInbound(supabase: Supa, input: SmsInbound): Promise<void> {
  return recordSmsInbound(supabase, 'twilio', input);
}

export function recordUnifonicInbound(supabase: Supa, input: SmsInbound): Promise<void> {
  return recordSmsInbound(supabase, 'unifonic', input);
}

export async function recordWhatsAppInboundMessage(
  supabase: Supa,
  destinationKey: string,
  message: WhatsAppInboundMessage,
  rawPayload: string,
): Promise<void> {
  if (!message.from || !message.id || !message.timestamp) return;
  const reservation = await reserveInbound(
    supabase,
    'whatsapp',
    destinationKey,
    message.id,
    rawPayload,
    message.timestamp,
  );
  if (!reservation) return;
  const { data: inboxRow, error: inboxError } = await supabase
    .from('whatsapp_inbox')
    .insert({
      tenant_id: reservation.tenantId,
      from_phone: message.from,
      body: message.text?.body ?? null,
      wamid: message.id,
    })
    .select('id, received_at')
    .single();
  if (inboxError) return;

  const body = message.text?.body ?? null;
  const action = await recordInboundConsentKeyword({
    supabase,
    phoneE164: message.from,
    channel: 'whatsapp',
    body,
    inboundMessageId: message.id,
  });
  if (action) {
    await enqueueWhatsApp({
      tenantId: reservation.tenantId,
      templateId: 'opt-out-confirmation',
      toPhone: message.from,
      input: {},
    });
  }
  await routeInboundReplyToLeadSafely(
    {
      tenantId: reservation.tenantId,
      channel: 'whatsapp',
      inboxId: inboxRow.id,
      fromPhone: message.from,
      body,
      providerMessageId: message.id,
      receivedAt: inboxRow.received_at,
    },
    { supabase },
  );
}
