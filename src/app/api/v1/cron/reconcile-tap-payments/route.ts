import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import { getCharge } from '@/lib/payments/providers/tap';
import {
  applyTapChargeReconciliation,
  extractTapChargeStatus,
} from '@/lib/payments/reconcile';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BATCH_SIZE = 50;
const RECONCILE_AFTER_MINUTES = 15;

type PaymentRow = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  status: string;
  provider_charge_id: string | null;
  created_at: string;
};

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('x-cron-secret');
  if (!env.CRON_SECRET || !auth || auth !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const cutoff = new Date(Date.now() - RECONCILE_AFTER_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('payments')
    .select('id, tenant_id, invoice_id, status, provider_charge_id, created_at')
    .eq('provider', 'tap')
    .eq('status', 'initiated')
    .not('provider_charge_id', 'is', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json(
      { error: error.message, code: 'DB_QUERY_FAILED' },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as PaymentRow[];
  const counts = { scanned: rows.length, updated: 0, unchanged: 0, noop: 0, errors: 0 };

  for (const row of rows) {
    try {
      const config = await resolveTenantTapConfig(row.tenant_id);
      if (!config || !config.enabled) throw new Error('Tap not configured for tenant');

      const charge = await getCharge(row.provider_charge_id!, config);
      if (!charge.ok) throw new Error(charge.error);

      const tapStatus = extractTapChargeStatus(charge.raw);
      if (!tapStatus) throw new Error('Tap charge response missing status');

      const outcome = await applyTapChargeReconciliation({
        supabase,
        payment: row,
        tapStatus,
        rawPayload: charge.raw,
      });
      counts[outcome] += 1;
    } catch (err) {
      counts.errors += 1;
      console.error('tap reconciliation failed', {
        payment_id: row.id,
        provider_charge_id: row.provider_charge_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, ...counts });
}
