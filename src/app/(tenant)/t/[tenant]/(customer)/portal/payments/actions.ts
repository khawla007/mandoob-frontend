'use server';

import 'server-only';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import { createCharge } from '@/lib/payments/providers/tap';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { consumeRateLimit } from '@/lib/rate-limit';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type PayInvoiceArgs = {
  tenantSlug: string;
  invoiceId: string;
};

export async function payInvoiceAction(
  args: PayInvoiceArgs,
): Promise<ActionResult<{ redirectUrl: string }>> {
  try {
    const session = await requireRole('customer');
    if (!session.tenantId) {
      return { ok: false, error: 'Session missing tenant binding', code: 'FORBIDDEN' };
    }

    const tenant = await resolveTenantBySlug(args.tenantSlug);
    if (!tenant) return { ok: false, error: 'Tenant not found', code: 'TENANT_NOT_FOUND' };
    if (session.tenantId !== tenant.id) {
      return { ok: false, error: 'Cross-tenant access denied', code: 'FORBIDDEN' };
    }
    await requireActiveTenant(tenant.id);

    const allowed = await consumeRateLimit({
      key: `payments:${tenant.id}`,
      capacity: 100,
      refillPerSec: 100 / 3600,
    });
    if (!allowed) {
      return { ok: false, error: 'Too many payment attempts', code: 'RATE_LIMITED' };
    }

    const admin = createSupabaseServiceRoleClient();
    const { data: invoice } = await admin
      .from('invoices')
      .select('id, tenant_id, customer_profile_id, status, amount_minor, currency, label')
      .eq('id', args.invoiceId)
      .maybeSingle();

    if (!invoice) {
      return { ok: false, error: 'Invoice not found', code: 'NOT_FOUND' };
    }
    if (invoice.tenant_id !== tenant.id) {
      return { ok: false, error: 'Cross-tenant invoice access denied', code: 'FORBIDDEN' };
    }
    if (invoice.customer_profile_id !== session.id) {
      return { ok: false, error: 'Invoice not yours', code: 'FORBIDDEN' };
    }
    if (invoice.status !== 'open') {
      return {
        ok: false,
        error: `Cannot pay invoice in state '${invoice.status}'`,
        code: 'INVALID_STATE',
      };
    }

    const config = await resolveTenantTapConfig(tenant.id);
    if (!config || !config.enabled) {
      return { ok: false, error: 'Tap not configured for this tenant', code: 'NOT_CONFIGURED' };
    }

    const [{ data: profile }, { data: authUser }] = await Promise.all([
      admin.from('profiles').select('full_name, phone').eq('id', session.id).maybeSingle(),
      admin.auth.admin.getUserById(session.id),
    ]);
    const email = authUser?.user?.email;
    if (!email) {
      return { ok: false, error: 'Customer email missing', code: 'INVALID_STATE' };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const charge = await createCharge({
      config,
      amountMinor: invoice.amount_minor,
      currency: invoice.currency,
      description: invoice.label,
      customer: {
        firstName: profile?.full_name ?? null,
        email,
        phoneNumber: profile?.phone ?? null,
      },
      redirectUrl: `${appUrl}/t/${tenant.slug}/portal?invoice=${invoice.id}`,
      postUrl: `${appUrl}/api/v1/webhooks/tap`,
      metadata: {
        tenant_id: tenant.id,
        invoice_id: invoice.id,
      },
    });

    if (!charge.ok) {
      await admin.from('tenant_audit_log').insert({
        tenant_id: tenant.id,
        actor_id: session.id,
        action: 'payment_failed',
        source: 'self_serve',
        details: {
          entity: 'payment',
          invoice_id: invoice.id,
          provider: 'tap',
          stage: 'create_charge',
          error: charge.error,
        },
      });
      return { ok: false, error: charge.error, code: 'TAP_ERROR' };
    }

    const { data: paymentRow, error: paymentErr } = await admin
      .from('payments')
      .insert({
        tenant_id: tenant.id,
        invoice_id: invoice.id,
        provider: 'tap',
        provider_charge_id: charge.chargeId,
        amount_minor: invoice.amount_minor,
        currency: invoice.currency,
        status: 'initiated',
      })
      .select('id')
      .single();

    if (paymentErr || !paymentRow) {
      return {
        ok: false,
        error: paymentErr?.message ?? 'Could not record payment',
        code: 'DB_INSERT_FAILED',
      };
    }

    const hdr = await headers();
    await admin.from('tenant_audit_log').insert({
      tenant_id: tenant.id,
      actor_id: session.id,
      action: 'payment_initiated',
      source: 'self_serve',
      details: {
        entity: 'payment',
        payment_id: paymentRow.id,
        invoice_id: invoice.id,
        provider: 'tap',
        provider_charge_id: charge.chargeId,
        ip: hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
      },
    });

    return { ok: true, data: { redirectUrl: charge.transactionUrl } };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message, code: err.code };
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: message, code: 'UNKNOWN' };
  }
}
