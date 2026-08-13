import { recordInboundConsentKeyword } from '@/lib/comms/consent';
import { routeInboundReplyToLeadSafely } from '@/lib/data/lead-reply-routing';
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

async function recordSmsInbound(
  supabase: Supa,
  provider: 'twilio' | 'unifonic',
  fromPhone: string,
  body: string,
  providerMessageId: string,
): Promise<void> {
  const { data: tenant } = await supabase
    .from('tenant_sms_config')
    .select('tenant_id')
    .eq('provider', provider)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();
  if (!tenant) return;

  const { data: inboxRow, error: inboxError } = await supabase
    .from('sms_inbox')
    .insert({
      tenant_id: tenant.tenant_id,
      from_phone: fromPhone,
      body,
      provider_message_id: providerMessageId,
    })
    .select('id, received_at')
    .single();
  if (inboxError) return;

  const action = await recordInboundConsentKeyword({
    supabase,
    phoneE164: fromPhone,
    channel: 'sms',
    body,
    inboundMessageId: providerMessageId,
  });
  if (action) {
    await enqueueSms({
      tenantId: tenant.tenant_id,
      templateId: 'opt-out-confirmation',
      toPhone: fromPhone,
      input: {},
    });
  }
  await routeInboundReplyToLeadSafely(
    {
      tenantId: tenant.tenant_id,
      channel: 'sms',
      inboxId: inboxRow.id,
      fromPhone,
      body,
      providerMessageId,
      receivedAt: inboxRow.received_at,
    },
    { supabase },
  );
}

export function recordTwilioInbound(
  supabase: Supa,
  fromPhone: string,
  body: string,
  providerMessageId: string,
): Promise<void> {
  return recordSmsInbound(supabase, 'twilio', fromPhone, body, providerMessageId);
}

export function recordUnifonicInbound(
  supabase: Supa,
  fromPhone: string,
  body: string,
  providerMessageId: string,
): Promise<void> {
  return recordSmsInbound(supabase, 'unifonic', fromPhone, body, providerMessageId);
}

export async function recordWhatsAppInboundMessage(
  supabase: Supa,
  tenantId: string,
  message: WhatsAppInboundMessage,
): Promise<void> {
  if (!message.from || !message.id) return;
  const { data: inboxRow, error: inboxError } = await supabase
    .from('whatsapp_inbox')
    .insert({
      tenant_id: tenantId,
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
      tenantId,
      templateId: 'opt-out-confirmation',
      toPhone: message.from,
      input: {},
    });
  }
  await routeInboundReplyToLeadSafely(
    {
      tenantId,
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
