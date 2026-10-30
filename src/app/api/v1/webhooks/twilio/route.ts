import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTwilioSignature } from '@/lib/sms/signature';
import { InboundWebhookInfrastructureError, recordTwilioInbound } from '../inbound-recording';
import {
  isTwilioInboundCallback,
  parseFormBody,
  parseTwilioInboundCallback,
  twilioInboundUnavailableCode,
} from './inbound';

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

  const messageStatus = params.MessageStatus ?? params.SmsStatus;
  const messageSid = params.MessageSid ?? params.SmsSid;
  const inboundShape = isTwilioInboundCallback(params);
  const unavailableCode = twilioInboundUnavailableCode(rawBody, env.TWILIO_INBOUND_ENABLED);
  if (unavailableCode) {
    return NextResponse.json(
      { error: 'inbound webhook unavailable', code: unavailableCode },
      { status: 503 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!inboundShape && messageStatus && messageSid) {
    await applyDeliveryStatus(supabase, messageSid, messageStatus);
  }

  // Inbound SMS: presence of Body + From, no status field.
  const inbound = parseTwilioInboundCallback(rawBody);
  try {
    if (inbound) await recordTwilioInbound(supabase, inbound);
  } catch (error) {
    if (error instanceof InboundWebhookInfrastructureError) {
      return NextResponse.json(
        { error: 'inbound webhook unavailable', code: 'TEMPORARILY_UNAVAILABLE' },
        { status: 503 },
      );
    }
    throw error;
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
