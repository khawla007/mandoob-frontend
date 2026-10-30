import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  recordReservedWhatsAppInboundMessage,
  reserveWhatsAppInboundMessage,
  type InboundReservation,
  type WhatsAppInboundMessage,
} from '../inbound-recording';

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

type WhatsAppDispatchDependencies = {
  reserve: (
    supabase: Supa,
    destinationKey: string,
    message: WhatsAppInboundMessage,
    rawBody: string,
  ) => Promise<InboundReservation | null>;
  record: (
    supabase: Supa,
    reservation: InboundReservation,
    message: WhatsAppInboundMessage,
  ) => Promise<void>;
  applyStatus: (supabase: Supa, status: WhatsAppStatus) => Promise<void>;
};

const defaultDispatchDependencies: WhatsAppDispatchDependencies = {
  reserve: reserveWhatsAppInboundMessage,
  record: recordReservedWhatsAppInboundMessage,
  applyStatus: applyStatusUpdate,
};

export async function dispatchWhatsAppWebhookPayload(
  supabase: Supa,
  payload: WhatsAppWebhookPayload,
  rawBody: string,
  dependencies: WhatsAppDispatchDependencies = defaultDispatchDependencies,
): Promise<void> {
  const inbound: Array<{
    destinationKey: string;
    message: WhatsAppInboundMessage;
  }> = [];
  const statuses: WhatsAppStatus[] = [];
  let missingInboundDestination = false;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      statuses.push(...(value.statuses ?? []));
      const destinationKey = value.metadata?.phone_number_id;
      for (const message of value.messages ?? []) {
        if (!destinationKey) {
          missingInboundDestination = true;
          continue;
        }
        inbound.push({ destinationKey, message });
      }
    }
  }
  if (missingInboundDestination) return;

  for (const item of inbound) {
    const reservation = await dependencies.reserve(
      supabase,
      item.destinationKey,
      item.message,
      rawBody,
    );
    if (reservation) await dependencies.record(supabase, reservation, item.message);
  }
  for (const status of statuses) {
    await dependencies.applyStatus(supabase, status);
  }
}

async function applyStatusUpdate(supabase: Supa, status: WhatsAppStatus): Promise<void> {
  if (!status.id) return;

  const { data: row } = await supabase
    .from('outbound_whatsapp')
    .select('id, attempts')
    .eq('provider_message_id', status.id)
    .maybeSingle();
  if (!row) return;

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {};

  switch (status.status) {
    case 'sent':
      update.status = 'sent';
      update.sent_at = nowIso;
      break;
    case 'delivered':
      update.status = 'delivered';
      update.delivered_at = nowIso;
      break;
    case 'read':
      update.status = 'read';
      update.read_at = nowIso;
      break;
    case 'failed':
      update.status = 'failed';
      update.last_error = status.errors?.[0]?.title ?? status.errors?.[0]?.message ?? 'failed';
      update.attempts = row.attempts + 1;
      break;
    default:
      return;
  }

  await supabase.from('outbound_whatsapp').update(update).eq('id', row.id);
}

export type WhatsAppWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        statuses?: WhatsAppStatus[];
        messages?: WhatsAppInboundMessage[];
      };
    }>;
  }>;
};

type WhatsAppStatus = {
  id?: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};
