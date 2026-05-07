import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyHubSignature } from '@/lib/whatsapp/signature';
import { recordInboundConsentKeyword } from '@/lib/comms/consent';
import { enqueueWhatsApp } from '@/lib/whatsapp/send';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (
    mode === 'subscribe' &&
    env.WHATSAPP_VERIFY_TOKEN &&
    token === env.WHATSAPP_VERIFY_TOKEN &&
    typeof challenge === 'string'
  ) {
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'forbidden', code: 'FORBIDDEN' }, { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  if (!env.WHATSAPP_APP_SECRET) {
    return NextResponse.json(
      { error: 'webhook not configured', code: 'NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-hub-signature-256') ?? '';
  if (!verifyHubSignature(rawBody, signatureHeader, env.WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ error: 'invalid signature', code: 'FORBIDDEN' }, { status: 403 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'invalid json', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id ?? null;
      const tenantId = phoneNumberId ? await resolveTenantId(supabase, phoneNumberId) : null;

      for (const status of value.statuses ?? []) {
        await applyStatusUpdate(supabase, status);
      }

      for (const message of value.messages ?? []) {
        if (!tenantId) continue;
        await recordInboundMessage(supabase, tenantId, message);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

async function resolveTenantId(supabase: Supa, phoneNumberId: string): Promise<string | null> {
  const { data } = await supabase
    .from('tenant_whatsapp_config')
    .select('tenant_id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
  return data?.tenant_id ?? null;
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

async function recordInboundMessage(
  supabase: Supa,
  tenantId: string,
  message: WhatsAppInboundMessage,
): Promise<void> {
  if (!message.from || !message.id) return;
  await supabase.from('whatsapp_inbox').insert({
    tenant_id: tenantId,
    from_phone: message.from,
    body: message.text?.body ?? null,
    wamid: message.id,
  });
  const action = await recordInboundConsentKeyword({
    supabase,
    phoneE164: message.from,
    channel: 'whatsapp',
    body: message.text?.body ?? null,
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
}

type WhatsAppWebhookPayload = {
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

type WhatsAppInboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};
