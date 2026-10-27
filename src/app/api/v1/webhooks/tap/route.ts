import { NextResponse } from 'next/server';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import {
  normalizeTapWebhookPayload,
  processTapWebhook,
  verifyTapWebhookPayload,
} from '@/lib/payments/tap-webhook';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const rawBody = new Uint8Array(await req.arrayBuffer());
  const signature = req.headers.get('hashstring') ?? '';
  const destination = new URL(req.url).searchParams.get('destination') ?? '';
  const supabase = createSupabaseServiceRoleClient();
  await processTapWebhook(
    { rawBody, signature, destination },
    {
      resolveDestination: async (value) => {
        if (!value) return null;
        const { data, error } = await supabase
          .from('tap_provider_destinations')
          .select('id, tenant_id, account_id')
          .eq('id', value)
          .eq('enabled', true)
          .maybeSingle();
        if (error || !data) return null;
        const config = await resolveTenantTapConfig(data.tenant_id);
        if (!config?.enabled || config.merchantId !== data.account_id) return null;
        return { accountId: data.account_id, secret: config.webhookSecret };
      },
      verify: verifyTapWebhookPayload,
      parse: (bytes) => normalizeTapWebhookPayload(bytes, req.headers.get('x-tap-event-id')),
      reserveEvent: async (event) => {
        const { data: row } = await supabase
          .from('tap_provider_destinations')
          .select('id')
          .eq('id', destination)
          .eq('account_id', event.accountId)
          .maybeSingle();
        if (!row) return { reserved: false };
        const { data, error } = await supabase.rpc(
          'p309_reserve_tap_event' as never,
          {
            p_destination_id: row.id,
            p_provider_event_id: event.eventId,
            p_body_hash: event.bodyHash,
            p_provider_reference: event.chargeId,
            p_amount_minor: event.amountMinor,
            p_currency: event.currency,
            p_provider_status: event.status,
            p_provider_occurred_at: event.occurredAt,
          } as never,
        );
        if (error || !data || typeof data !== 'object') return { reserved: false };
        const receipt = data as { reserved?: unknown; token?: unknown; eventId?: unknown };
        return receipt.reserved === true &&
          typeof receipt.token === 'string' &&
          typeof receipt.eventId === 'string'
          ? { reserved: true, token: receipt.token, claimId: receipt.eventId }
          : { reserved: false };
      },
      reconcile: async (event) => {
        if (!event.claimId) return 'fenced';
        const { data, error } = await supabase.rpc(
          'p309_reconcile_tap_event' as never,
          {
            p_event_id: event.claimId,
            p_fence_token: event.token,
          } as never,
        );
        if (error || !data || typeof data !== 'object') return 'fenced';
        const outcome = (data as { outcome?: unknown }).outcome;
        return ['updated', 'duplicate', 'stale', 'fenced', 'mismatch'].includes(String(outcome))
          ? (outcome as 'updated' | 'duplicate' | 'stale' | 'fenced' | 'mismatch')
          : 'fenced';
      },
    },
  );
  return NextResponse.json({ accepted: true }, { status: 202 });
}
