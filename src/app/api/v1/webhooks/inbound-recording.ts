import { createHash } from 'node:crypto';
import { z } from 'zod';
import { routeInboundReplyToLead } from '@/lib/data/lead-reply-routing';
import type { Database } from '@/lib/db/database.types';
import { hashDestinationKey, isWebhookTimestampWithinTolerance } from '@/lib/events/contracts';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

export type WhatsAppInboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

export type SmsInbound = {
  destinationKey: string;
  fromPhone: string;
  body: string;
  providerEventId: string;
  occurredAt: string;
  rawPayload: string;
};

export type InboundReservation = {
  tenantId: string;
  inboxId: number;
  receivedAt: string;
  operationKey: string;
};

export class InboundWebhookInfrastructureError extends Error {
  constructor() {
    super('INBOUND_WEBHOOK_INFRASTRUCTURE_ERROR');
    this.name = 'InboundWebhookInfrastructureError';
  }
}

type GeneratedInboundRpcRow =
  Database['public']['Functions']['accept_inbound_webhook']['Returns'][number];
type OwnershipFreeNoOpOutcome = 'unknown' | 'stale' | 'rejected';
type InboundRpcRow =
  | (Omit<GeneratedInboundRpcRow, 'outcome'> & { outcome: 'accepted' | 'duplicate' })
  | (Omit<
      GeneratedInboundRpcRow,
      'outcome' | 'tenant_id' | 'inbox_id' | 'received_at' | 'routing_key'
    > & {
      outcome: OwnershipFreeNoOpOutcome;
      tenant_id: null;
      inbox_id: null;
      received_at: null;
      routing_key: null;
    });

const inboundRpcRowSchema: z.ZodType<InboundRpcRow> = z.discriminatedUnion('outcome', [
  z
    .object({
      outcome: z.enum(['accepted', 'duplicate']),
      tenant_id: z.string().uuid(),
      inbox_id: z.number().int().positive(),
      received_at: z.string().datetime({ offset: true }),
      routing_key: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      outcome: z.enum(['unknown', 'stale', 'rejected']),
      tenant_id: z.null(),
      inbox_id: z.null(),
      received_at: z.null(),
      routing_key: z.null(),
    })
    .strict(),
]);

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

async function acceptInbound(
  supabase: Supa,
  provider: 'twilio' | 'unifonic' | 'whatsapp',
  channel: 'sms' | 'whatsapp',
  destinationKey: string,
  fromPhone: string,
  body: string | null,
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
    throw new InboundWebhookInfrastructureError();
  }

  let result;
  try {
    result = await supabase.rpc('accept_inbound_webhook', {
      p_provider: provider,
      p_channel: channel,
      p_destination_key_hash: destinationKeyHash,
      p_provider_event_id_hash: hashOpaque(providerEventId),
      p_payload_hash: hashOpaque(rawPayload),
      p_occurred_at: occurredAt,
      p_signature_verified: true,
      p_from_phone: fromPhone,
      p_body: body ?? '',
      p_provider_event_id: providerEventId,
    });
  } catch {
    throw new InboundWebhookInfrastructureError();
  }
  const { data, error } = result;
  const parsed = inboundRpcRowSchema.array().safeParse(data);
  if (error || !parsed.success || parsed.data.length !== 1) {
    throw new InboundWebhookInfrastructureError();
  }
  const row = parsed.data[0];
  if (row.outcome !== 'accepted' && row.outcome !== 'duplicate') return null;
  return {
    tenantId: row.tenant_id,
    inboxId: row.inbox_id,
    receivedAt: row.received_at,
    operationKey: row.routing_key,
  };
}

async function recordSmsInbound(
  supabase: Supa,
  provider: 'twilio' | 'unifonic',
  input: SmsInbound,
): Promise<void> {
  const reservation = await acceptInbound(
    supabase,
    provider,
    'sms',
    input.destinationKey,
    input.fromPhone,
    input.body,
    input.providerEventId,
    input.rawPayload,
    input.occurredAt,
  );
  if (!reservation) return;

  await routeAcceptedInboundReply(supabase, {
    tenantId: reservation.tenantId,
    channel: 'sms',
    inboxId: reservation.inboxId,
    operationKey: reservation.operationKey,
    fromPhone: input.fromPhone,
    body: input.body,
    providerMessageId: input.providerEventId,
    receivedAt: reservation.receivedAt,
  });
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
  const reservation = await reserveWhatsAppInboundMessage(
    supabase,
    destinationKey,
    message,
    rawPayload,
  );
  if (!reservation) return;
  await recordReservedWhatsAppInboundMessage(supabase, reservation, message);
}

export async function reserveWhatsAppInboundMessage(
  supabase: Supa,
  destinationKey: string,
  message: WhatsAppInboundMessage,
  rawPayload: string,
): Promise<InboundReservation | null> {
  if (!message.from || !message.id || !message.timestamp) return null;
  return acceptInbound(
    supabase,
    'whatsapp',
    'whatsapp',
    destinationKey,
    message.from,
    message.text?.body ?? null,
    message.id,
    rawPayload,
    message.timestamp,
  );
}

export async function recordReservedWhatsAppInboundMessage(
  supabase: Supa,
  reservation: InboundReservation,
  message: WhatsAppInboundMessage,
): Promise<void> {
  if (!message.from || !message.id) return;
  const body = message.text?.body ?? null;
  await routeAcceptedInboundReply(supabase, {
    tenantId: reservation.tenantId,
    channel: 'whatsapp',
    inboxId: reservation.inboxId,
    operationKey: reservation.operationKey,
    fromPhone: message.from,
    body,
    providerMessageId: message.id,
    receivedAt: reservation.receivedAt,
  });
}

async function routeAcceptedInboundReply(
  supabase: Supa,
  input: Parameters<typeof routeInboundReplyToLead>[0],
): Promise<void> {
  try {
    await routeInboundReplyToLead(input, { supabase });
  } catch (error) {
    console.error('lead inbound reply routing infrastructure failure', {
      channel: input.channel,
      inbox_id: input.inboxId,
      operation_key: input.operationKey,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new InboundWebhookInfrastructureError();
  }
}
