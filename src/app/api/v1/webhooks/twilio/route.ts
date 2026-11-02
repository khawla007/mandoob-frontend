import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import {
  applyProviderDeliveryStatus,
  ProviderDeliveryStatusUnavailableError,
} from '@/lib/events/provider-delivery-status';
import {
  BODY_LIMITS,
  BodyTooLargeError,
  decodeBoundedUtf8,
  readBoundedBody,
} from '@/lib/http/bounded-body';
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

  let rawBody: string;
  try {
    rawBody = decodeBoundedUtf8(await readBoundedBody(req, BODY_LIMITS.providerWebhook));
  } catch (error) {
    return error instanceof BodyTooLargeError
      ? NextResponse.json(
          { error: 'request too large', code: 'PAYLOAD_TOO_LARGE' },
          { status: 413 },
        )
      : NextResponse.json({ error: 'invalid request', code: 'BAD_REQUEST' }, { status: 400 });
  }
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

  try {
    if (!inboundShape && messageStatus && messageSid) {
      await applyProviderDeliveryStatus(supabase, {
        channel: 'sms',
        provider: 'twilio',
        providerMessageId: messageSid,
        providerStatus: messageStatus,
        providerOccurredAt: params.Timestamp ?? params.DateUpdated ?? params.DateCreated,
        safeErrorCode: params.ErrorCode,
      });
    }

    // Inbound SMS: presence of Body + From, no status field.
    const inbound = parseTwilioInboundCallback(rawBody);
    if (inbound) await recordTwilioInbound(supabase, inbound);
  } catch (error) {
    if (error instanceof ProviderDeliveryStatusUnavailableError) {
      return NextResponse.json(
        { error: 'webhook unavailable', code: 'TEMPORARILY_UNAVAILABLE' },
        { status: 503 },
      );
    }
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
