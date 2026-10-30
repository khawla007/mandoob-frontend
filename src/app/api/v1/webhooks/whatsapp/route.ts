import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyHubSignature } from '@/lib/whatsapp/signature';
import { InboundWebhookInfrastructureError } from '../inbound-recording';
import { dispatchWhatsAppWebhookPayload, type WhatsAppWebhookPayload } from './dispatch';

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
  try {
    await dispatchWhatsAppWebhookPayload(supabase, payload, rawBody);
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
