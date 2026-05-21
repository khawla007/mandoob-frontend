import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTwilioSignature } from '@/lib/sms/signature';
import { recordInboundConsentKeyword } from '@/lib/comms/consent';
import { routeInboundReplyToLeadSafely } from '@/lib/data/lead-reply-routing';
import { enqueueSms } from '@/lib/sms/send';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

// Twilio sends application/x-www-form-urlencoded for both Status Callback
// and inbound SMS. The same endpoint handles both — we differentiate by
// presence of `MessageStatus` (status callback) vs `Body`+`From` (inbound).
export async function POST(req: Request): Promise<Response> {
  if (!env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json(
      { error: 'webhook not configured', code: 'NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const params = parseFormBody(rawBody);
  const fullUrl = buildSignatureUrl(req);
  const sigHeader = req.headers.get('x-twilio-signature');

  if (!verifyTwilioSignature(fullUrl, params, sigHeader, env.TWILIO_AUTH_TOKEN)) {
    return NextResponse.json({ error: 'invalid signature', code: 'FORBIDDEN' }, { status: 403 });
  }

  const supabase = createSupabaseServiceRoleClient();

  const messageStatus = params.MessageStatus ?? params.SmsStatus;
  const messageSid = params.MessageSid ?? params.SmsSid;

  if (messageStatus && messageSid) {
    await applyDeliveryStatus(supabase, messageSid, messageStatus);
  }

  // Inbound SMS: presence of Body + From, no status field.
  if (!messageStatus && params.From && params.Body !== undefined && messageSid) {
    await recordTwilioInbound(supabase, params.From, params.Body, messageSid);
  }

  return NextResponse.json({ ok: true });
}

function buildSignatureUrl(req: Request): string {
  const url = new URL(req.url);
  // Twilio signs the URL the request was made to. When proxied through
  // Vercel/Cloudflare we may need to honour x-forwarded-{proto,host}; default
  // to req.url which already reflects the public host in production.
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? url.host;
  return `${proto}://${host}${url.pathname}${url.search}`;
}

function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

const STATUS_MAP: Record<string, 'pending' | 'sent' | 'delivered' | 'failed' | 'dead'> = {
  queued: 'pending',
  accepted: 'pending',
  scheduled: 'pending',
  sending: 'pending',
  sent: 'sent',
  delivered: 'delivered',
  read: 'delivered',
  undelivered: 'dead',
  failed: 'failed',
  canceled: 'dead',
};

async function applyDeliveryStatus(
  supabase: Supa,
  providerMessageId: string,
  twilioStatus: string,
): Promise<void> {
  const mapped = STATUS_MAP[twilioStatus.toLowerCase()];
  if (!mapped) return;

  const { data: row } = await supabase
    .from('outbound_sms')
    .select('id')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (!row) return;

  const update: Record<string, unknown> = { status: mapped };
  const nowIso = new Date().toISOString();
  if (mapped === 'sent') update.sent_at = nowIso;
  if (mapped === 'delivered') update.delivered_at = nowIso;

  await supabase.from('outbound_sms').update(update).eq('id', row.id);
}

export async function recordTwilioInbound(
  supabase: Supa,
  fromPhone: string,
  body: string,
  providerMessageId: string,
): Promise<void> {
  const { data: tenant } = await supabase
    .from('tenant_sms_config')
    .select('tenant_id')
    .eq('provider', 'twilio')
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
