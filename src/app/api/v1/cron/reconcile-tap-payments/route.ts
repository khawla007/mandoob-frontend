import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import {
  createRefund,
  getCharge,
  getRefund,
  lookupChargeByEffectKey,
  lookupRefundByEffectKey,
  mapTapRefundStatus,
} from '@/lib/payments/providers/tap';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { reconcileTerminalTapRefundFailure } from '@/lib/payments/refund-effect-failure';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const BATCH_SIZE = 25;

type AttemptClaim = {
  id: string;
  tenant_id: string;
  provider_reference: string | null;
  provider_effect_key: string;
  lease_token: string;
  destination_id: string;
};
type RefundClaim = {
  id: string;
  tenant_id: string;
  payment_id: string;
  provider_refund_id: string | null;
  provider_effect_key: string;
  amount_minor: number;
  currency: string;
  reason: string;
  recovery_lease_token: string;
};
type CompensationClaim = {
  id: string;
  tenant_id: string;
  provider_reference: string;
  compensation_effect_key: string;
  compensation_reference: string | null;
  amount_minor: number;
  currency: string;
  lease_token: string;
  destination_id: string;
};
type EventClaim = { id: string; fence_token: string };

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('x-cron-secret');
  if (!env.CRON_SECRET || !auth || auth !== env.CRON_SECRET)
    return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const client = createSupabaseServiceRoleClient();
  const workerId = randomUUID();
  const attempts = await client.rpc(
    'p309_claim_tap_recovery' as never,
    {
      p_worker_id: workerId,
      p_limit: BATCH_SIZE,
      p_lease_seconds: 60,
    } as never,
  );
  const refunds = await client.rpc(
    'p309_claim_tap_refund_recovery' as never,
    {
      p_worker_id: workerId,
      p_limit: BATCH_SIZE,
      p_lease_seconds: 60,
    } as never,
  );
  const compensations = await client.rpc(
    'p309_claim_tap_compensation' as never,
    {
      p_worker_id: workerId,
      p_limit: BATCH_SIZE,
      p_lease_seconds: 60,
    } as never,
  );
  const events = await client.rpc(
    'p309_claim_tap_event_recovery' as never,
    { p_worker_id: workerId, p_limit: BATCH_SIZE, p_lease_seconds: 60 } as never,
  );
  const counts = { events: 0, attempts: 0, refunds: 0, compensations: 0, errors: 0 };
  if (attempts.error || refunds.error || compensations.error || events.error)
    return NextResponse.json(
      { error: 'recovery unavailable', code: 'UNAVAILABLE' },
      { status: 503 },
    );

  for (const row of (events.data ?? []) as EventClaim[]) {
    const reconciled = await client.rpc(
      'p309_reconcile_tap_event' as never,
      { p_event_id: row.id, p_fence_token: row.fence_token } as never,
    );
    if (reconciled.error) counts.errors += 1;
    else counts.events += 1;
  }

  for (const row of (attempts.data ?? []) as AttemptClaim[]) {
    try {
      const config = await resolveTenantTapConfig(row.tenant_id);
      if (
        !config?.enabled ||
        !(await destinationMatches(client, row.tenant_id, row.destination_id, config.merchantId))
      )
        throw new Error('provider disabled');
      let providerReference = row.provider_reference;
      if (!providerReference) {
        const recovered = await lookupChargeByEffectKey(row.provider_effect_key, config);
        if (!recovered.ok || !config.merchantId || recovered.merchantId !== config.merchantId)
          throw new Error('effect lookup required');
        providerReference = recovered.chargeId;
        const attached = await client.rpc(
          'p309_attach_payment_attempt_recovery' as never,
          {
            p_attempt_id: row.id,
            p_worker_id: workerId,
            p_lease_token: row.lease_token,
            p_effect_key: row.provider_effect_key,
            p_provider_reference: recovered.chargeId,
            p_redirect_url: recovered.transactionUrl,
          } as never,
        );
        if (attached.error) throw new Error('attach failed');
      }
      const charge = await getCharge(providerReference, config);
      if (!charge.ok || !config.merchantId || charge.merchantId !== config.merchantId)
        throw new Error('provider unavailable');
      const reconciled = await client.rpc(
        'p309_reconcile_payment_attempt' as never,
        {
          p_attempt_id: row.id,
          p_provider_reference: charge.chargeId,
          p_amount_minor: charge.amountMinor,
          p_currency: charge.currency,
          p_provider_status: charge.status,
          p_worker_id: workerId,
          p_lease_token: row.lease_token,
        } as never,
      );
      if (reconciled.error) throw new Error('reconcile failed');
      counts.attempts += 1;
    } catch {
      counts.errors += 1;
    } finally {
      await client.rpc(
        'p309_complete_tap_recovery' as never,
        {
          p_attempt_id: row.id,
          p_worker_id: workerId,
          p_lease_token: row.lease_token,
        } as never,
      );
    }
  }

  for (const row of (compensations.data ?? []) as CompensationClaim[]) {
    try {
      const config = await resolveTenantTapConfig(row.tenant_id);
      if (
        !config?.enabled ||
        !(await destinationMatches(client, row.tenant_id, row.destination_id, config.merchantId))
      )
        throw new Error('provider disabled');
      let compensationReference = row.compensation_reference;
      if (!compensationReference) {
        const recovered = await lookupRefundByEffectKey(row.compensation_effect_key, config);
        if (!recovered.ok && recovered.error !== 'provider effect not found')
          throw new Error('provider unavailable');
        const created = recovered.ok
          ? recovered
          : await createRefund({
              config,
              chargeId: row.provider_reference,
              amountMinor: row.amount_minor,
              currency: row.currency,
              reason: 'Captured payment for a closed invoice',
              idempotencyKey: row.compensation_effect_key,
            });
        if (!created.ok || !config.merchantId || created.merchantId !== config.merchantId)
          throw new Error('provider unavailable');
        compensationReference = created.refundId;
        const attached = await client.rpc(
          'p309_attach_tap_compensation' as never,
          {
            p_attempt_id: row.id,
            p_worker_id: workerId,
            p_lease_token: row.lease_token,
            p_effect_key: row.compensation_effect_key,
            p_compensation_reference: compensationReference,
          } as never,
        );
        if (attached.error) throw new Error('attach failed');
      }
      const provider = await getRefund(compensationReference, config);
      if (!provider.ok || !config.merchantId || provider.merchantId !== config.merchantId)
        throw new Error('provider unavailable');
      const status = mapTapRefundStatus(provider.status);
      if (status !== 'pending') {
        const reconciled = await client.rpc(
          'p309_reconcile_tap_compensation' as never,
          {
            p_attempt_id: row.id,
            p_worker_id: workerId,
            p_lease_token: row.lease_token,
            p_compensation_reference: compensationReference,
            p_status: status,
          } as never,
        );
        if (reconciled.error) throw new Error('reconcile failed');
      }
      counts.compensations += 1;
    } catch {
      counts.errors += 1;
    } finally {
      await client.rpc(
        'p309_complete_tap_compensation' as never,
        {
          p_attempt_id: row.id,
          p_worker_id: workerId,
          p_lease_token: row.lease_token,
        } as never,
      );
    }
  }

  for (const row of (refunds.data ?? []) as RefundClaim[]) {
    try {
      const config = await resolveTenantTapConfig(row.tenant_id);
      if (!config?.enabled) throw new Error('provider disabled');
      const payment = await client
        .from('payments')
        .select('provider_charge_id')
        .eq('id', row.payment_id)
        .eq('tenant_id', row.tenant_id)
        .eq('provider', 'tap')
        .maybeSingle();
      if (!payment.data?.provider_charge_id) throw new Error('owned charge missing');
      const attempt = await client
        .from('payment_provider_attempts')
        .select('destination_id')
        .eq('tenant_id', row.tenant_id)
        .eq('payment_id', row.payment_id)
        .eq('provider_reference', payment.data.provider_charge_id)
        .maybeSingle();
      if (
        !attempt.data?.destination_id ||
        !(await destinationMatches(
          client,
          row.tenant_id,
          attempt.data.destination_id,
          config.merchantId,
        ))
      )
        throw new Error('provider destination mismatch');
      let providerRefundId = row.provider_refund_id;
      if (!providerRefundId) {
        const recovered = await lookupRefundByEffectKey(row.provider_effect_key, config);
        if (!recovered.ok && recovered.error !== 'provider effect not found')
          throw new Error('provider unavailable');
        const replay = recovered.ok
          ? recovered
          : await createRefund({
              config,
              chargeId: payment.data.provider_charge_id,
              amountMinor: row.amount_minor,
              currency: row.currency,
              reason: row.reason,
              idempotencyKey: row.provider_effect_key,
            });
        if (!replay.ok) {
          const disposition = await reconcileTerminalTapRefundFailure(
            replay.retryable,
            async (failure) => {
              const failed = await client.rpc(
                'p309_reconcile_claimed_refund' as never,
                {
                  p_refund_id: row.id,
                  p_provider_refund_id: failure.providerRefundId,
                  p_status: failure.status,
                  p_worker_id: workerId,
                  p_lease_token: row.recovery_lease_token,
                } as never,
              );
              if (failed.error) throw new Error('failure reconcile failed');
            },
          );
          if (disposition === 'failed') {
            counts.refunds += 1;
            continue;
          }
          throw new Error('provider unavailable');
        }
        if (!config.merchantId || replay.merchantId !== config.merchantId)
          throw new Error('provider unavailable');
        providerRefundId = replay.refundId;
        const attached = await client.rpc(
          'p309_attach_refund_effect_recovery' as never,
          {
            p_refund_id: row.id,
            p_provider_effect_key: row.provider_effect_key,
            p_provider_refund_id: providerRefundId,
            p_worker_id: workerId,
            p_lease_token: row.recovery_lease_token,
          } as never,
        );
        if (attached.error) throw new Error('attach failed');
      }
      const provider = await getRefund(providerRefundId, config);
      if (!provider.ok || !config.merchantId || provider.merchantId !== config.merchantId)
        throw new Error('provider unavailable');
      const status = mapTapRefundStatus(provider.status);
      if (status !== 'pending') {
        const reconciled = await client.rpc(
          'p309_reconcile_claimed_refund' as never,
          {
            p_refund_id: row.id,
            p_provider_refund_id: providerRefundId,
            p_status: status,
            p_worker_id: workerId,
            p_lease_token: row.recovery_lease_token,
          } as never,
        );
        if (reconciled.error) throw new Error('reconcile failed');
      }
      counts.refunds += 1;
    } catch {
      counts.errors += 1;
    } finally {
      await client.rpc(
        'p309_complete_tap_refund_recovery' as never,
        {
          p_refund_id: row.id,
          p_worker_id: workerId,
          p_lease_token: row.recovery_lease_token,
        } as never,
      );
    }
  }
  return NextResponse.json({ ok: true, ...counts });
}

async function destinationMatches(
  client: ReturnType<typeof createSupabaseServiceRoleClient>,
  tenantId: string,
  destinationId: string,
  merchantId: string | null,
): Promise<boolean> {
  if (!merchantId) return false;
  const destination = await client
    .from('tap_provider_destinations')
    .select('account_id')
    .eq('id', destinationId)
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .maybeSingle();
  return destination.data?.account_id === merchantId;
}
