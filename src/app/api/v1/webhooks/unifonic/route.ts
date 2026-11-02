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
import { verifyUnifonicSignature } from '@/lib/sms/signature';
import { InboundWebhookInfrastructureError, recordUnifonicInbound } from '../inbound-recording';
import { parseUnifonicInboundCallback, type UnifonicPayload } from './inbound';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Unifonic webhooks (DLR + inbound) deliver JSON. Status DLR carries
// MessageID + Status; inbound carries From + Body + MessageID.
export async function POST(req: Request): Promise<Response> {
  if (!env.UNIFONIC_WEBHOOK_SECRET) {
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
  const sigHeader =
    req.headers.get('x-unifonic-signature') ?? req.headers.get('x-signature') ?? null;

  if (!verifyUnifonicSignature(rawBody, sigHeader, env.UNIFONIC_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'invalid signature', code: 'FORBIDDEN' }, { status: 403 });
  }

  let payload: UnifonicPayload;
  try {
    payload = JSON.parse(rawBody) as UnifonicPayload;
  } catch {
    return NextResponse.json({ error: 'invalid json', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const messageId = payload.MessageID ?? payload.messageId;

  try {
    if (payload.Status && messageId) {
      await applyProviderDeliveryStatus(supabase, {
        channel: 'sms',
        provider: 'unifonic',
        providerMessageId: String(messageId),
        providerStatus: payload.Status,
        providerOccurredAt: payload.Timestamp ?? payload.timestamp,
        safeErrorCode: payload.ErrorCode ?? payload.errorCode,
      });
    }

    const inbound = parseUnifonicInboundCallback(payload, rawBody);
    if (inbound) await recordUnifonicInbound(supabase, inbound);
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
