import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import { getCharge, getRefund } from '@/lib/payments/providers/tap';
import { applyTapChargeReconciliation, extractTapChargeStatus } from '@/lib/payments/reconcile';
import {
  drainPendingRefundPages,
  reconcilePendingTapRefund,
  type PendingRefundCursor,
} from '@/lib/payments/refund-reconciliation';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BATCH_SIZE = 50;
const MAX_REFUND_PAGES = 20;
const REFUND_WORKER_NAME = 'tap-refund-poller';
const RECONCILE_AFTER_MINUTES = 15;

type PaymentRow = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  status: string;
  provider_charge_id: string | null;
  created_at: string;
};

type RefundRow = {
  id: string;
  tenant_id: string;
  payment_id: string;
  provider_refund_id: string;
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
    return NextResponse.json({ error: error.message, code: 'DB_QUERY_FAILED' }, { status: 500 });
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

  const refundCounts = await reconcilePendingRefunds(supabase, cutoff);

  return NextResponse.json({ ok: true, ...counts, refunds: refundCounts });
}

async function reconcilePendingRefunds(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  cutoff: string,
) {
  const persistedCursor = await readRefundCursor(supabase);
  const result = await drainPendingRefundPages<RefundRow>(
    async (cursor, limit) => fetchPendingRefundPage(supabase, cutoff, cursor, limit),
    async (row) => {
      try {
        const { data: payment, error: paymentError } = await supabase
          .from('payments')
          .select('id, tenant_id, invoice_id, provider')
          .eq('id', row.payment_id)
          .eq('tenant_id', row.tenant_id)
          .eq('provider', 'tap')
          .maybeSingle();
        if (paymentError || !payment) throw new Error('owned Tap payment not found');

        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .select('id, tenant_id, company_id')
          .eq('id', payment.invoice_id)
          .eq('tenant_id', row.tenant_id)
          .maybeSingle();
        if (invoiceError || !invoice?.company_id) throw new Error('owned refund invoice not found');

        const config = await resolveTenantTapConfig(row.tenant_id);
        if (!config || !config.enabled) throw new Error('Tap not configured for tenant');
        const outcome = await reconcilePendingTapRefund(
          {
            tenantId: row.tenant_id,
            companyId: invoice.company_id,
            refundId: row.id,
            providerRefundId: row.provider_refund_id,
          },
          {
            fetchStatus: async (providerRefundId) => {
              const result = await getRefund(providerRefundId, config);
              if (!result.ok) throw new Error(result.error);
              return result.status;
            },
            reconcile: async (input) => {
              const { data: reconciled, error: reconcileError } = await supabase.rpc(
                'reconcile_company_refund' as never,
                {
                  p_tenant_id: input.tenantId,
                  p_company_id: input.companyId,
                  p_refund_id: input.refundId,
                  p_actor_id: null,
                  p_provider_refund_id: input.providerRefundId,
                  p_status: input.status,
                  p_ip: 'cron',
                } as never,
              );
              const result = ((reconciled as unknown as Array<{ refund_id?: string }> | null) ??
                [])[0];
              if (reconcileError || result?.refund_id !== input.refundId) {
                throw new Error(reconcileError?.message ?? 'refund reconciliation not persisted');
              }
            },
          },
        );
        return outcome;
      } catch (error) {
        console.error('tap refund reconciliation failed', {
          refund_id: row.id,
          provider_refund_id: row.provider_refund_id,
          error: error instanceof Error ? error.message : String(error),
        });
        return 'error';
      }
    },
    {
      pageSize: BATCH_SIZE,
      maxPages: MAX_REFUND_PAGES,
      initialCursor: persistedCursor,
    },
  );
  await persistRefundCursor(supabase, result.nextCursor);
  return {
    scanned: result.scanned,
    updated: result.updated,
    unchanged: result.unchanged,
    errors: result.errors,
  };
}

async function readRefundCursor(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
): Promise<PendingRefundCursor | null> {
  const { data, error } = await supabase
    .from('refund_reconciliation_state')
    .select('cursor_created_at, cursor_id')
    .eq('worker_name', REFUND_WORKER_NAME)
    .maybeSingle();
  if (error) throw new Error(`refund reconciliation cursor read failed: ${error.message}`);
  if (!data?.cursor_created_at || !data.cursor_id) return null;
  return { createdAt: data.cursor_created_at, id: data.cursor_id };
}

async function persistRefundCursor(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  cursor: PendingRefundCursor | null,
): Promise<void> {
  const { error } = await supabase.from('refund_reconciliation_state').upsert(
    {
      worker_name: REFUND_WORKER_NAME,
      cursor_created_at: cursor?.createdAt ?? null,
      cursor_id: cursor?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'worker_name' },
  );
  if (error) throw new Error(`refund reconciliation cursor write failed: ${error.message}`);
}

async function fetchPendingRefundPage(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  cutoff: string,
  cursor: PendingRefundCursor | null,
  limit: number,
): Promise<RefundRow[]> {
  let query = supabase
    .from('refunds')
    .select('id, tenant_id, payment_id, provider_refund_id, created_at')
    .eq('status', 'pending')
    .not('provider_refund_id', 'is', null)
    .lt('created_at', cutoff);
  if (cursor) {
    query = query.or(
      `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
    );
  }
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`refund reconciliation query failed: ${error.message}`);
  return (data ?? []) as RefundRow[];
}
