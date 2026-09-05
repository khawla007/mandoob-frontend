'use server';

import 'server-only';

import { validateCustomerInvoiceForPayment } from '@/lib/customer/customer-payment-action';
import { requireAuthorizedCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export async function payInvoiceAction(args: {
  tenantSlug: string;
  invoiceId: string;
}): Promise<ActionResult<{ redirectUrl: string }>> {
  try {
    const access = await requireAuthorizedCustomerLinkedCompanyRead(args.tenantSlug);
    const { data, error } = await createSupabaseServiceRoleClient()
      .from('invoices')
      .select(
        'id, tenant_id, company_id, customer_profile_id, label, amount_minor, currency, status, due_at, paid_at, created_at',
      )
      .eq('tenant_id', access.tenant.id)
      .eq('company_id', access.company.id)
      .eq('customer_profile_id', access.session.id)
      .eq('id', args.invoiceId)
      .maybeSingle();
    const validation = validateCustomerInvoiceForPayment(
      data,
      {
        tenantId: access.tenant.id,
        companyId: access.company.id,
        profileId: access.session.id,
        invoiceId: args.invoiceId,
      },
      error,
    );
    if (!validation.ok) return validation;

    // No accepted atomic reservation/idempotency contract exists. Initiation stays closed
    // so concurrent calls cannot create multiple external charges. Phase 3 owns that work.
    return {
      ok: false,
      error: 'Online payment is unavailable',
      code: 'PAYMENT_CONTRACT_UNAVAILABLE',
    };
  } catch {
    return { ok: false, error: 'Payment is unavailable', code: 'FORBIDDEN' };
  }
}
