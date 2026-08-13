import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyUnifonicSignature } from '@/lib/sms/signature';
import { recordUnifonicInbound } from '../inbound-recording';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

// Unifonic webhooks (DLR + inbound) deliver JSON. Status DLR carries
// MessageID + Status; inbound carries From + Body + MessageID.
export async function POST(req: Request): Promise<Response> {
  if (!env.UNIFONIC_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'webhook not configured', code: 'NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
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

  if (payload.Status && messageId) {
    await applyDeliveryStatus(supabase, String(messageId), payload.Status);
  }

  if (!payload.Status && payload.From && payload.Body !== undefined && messageId) {
    await recordUnifonicInbound(supabase, payload.From, payload.Body ?? '', String(messageId));
  }

  return NextResponse.json({ ok: true });
}

const STATUS_MAP: Record<string, 'pending' | 'sent' | 'delivered' | 'failed' | 'dead'> = {
  queued: 'pending',
  pending: 'pending',
  sent: 'sent',
  delivered: 'delivered',
  failed: 'failed',
  rejected: 'dead',
  expired: 'dead',
  undelivered: 'dead',
};

async function applyDeliveryStatus(
  supabase: Supa,
  providerMessageId: string,
  status: string,
): Promise<void> {
  const mapped = STATUS_MAP[status.toLowerCase()];
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

type UnifonicPayload = {
  MessageID?: string | number;
  messageId?: string | number;
  Status?: string;
  From?: string;
  Body?: string;
};
