import 'server-only';

import type { CustomerCompanyAccess } from './customer-company-access';
import { settleCustomerWidgets } from '@/lib/customer/customer-overview';
import { getProfileCard } from './profile';
import { listDocumentsForCompany, listOpenRequestsForCompany } from './documents';
import { listRenewalsForCompany } from './renewals';
import type { PaymentHistory } from './payments';
import { getCommsForCustomer } from './comms';
import { readCurrentCompanyAssignment } from './company-assignments';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { formatMoney } from '@/lib/format/money';

async function loadCustomerOverviewInvoices(
  tenantId: string,
  companyId: string,
  profileId: string,
): Promise<PaymentHistory> {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('invoices')
    .select('id, label, amount_minor, currency, status, due_at, paid_at, created_at')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .eq('customer_profile_id', profileId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(100);
  if (error) throw new Error('CUSTOMER_INVOICES_UNAVAILABLE');

  const result: PaymentHistory = { pending: [], history: [] };
  for (const row of data ?? []) {
    const amount = formatMoney(row.amount_minor, row.currency);
    if (row.status === 'open') {
      result.pending.push({
        id: row.id,
        label: row.label,
        amount,
        amountMinor: row.amount_minor,
        currency: row.currency,
        dueDate: row.due_at,
      });
    } else if (['paid', 'refunded', 'partially_refunded'].includes(row.status)) {
      result.history.push({
        id: row.id,
        label: row.label,
        amount,
        paidAt: row.paid_at ?? row.created_at,
        status: row.status as 'paid' | 'refunded' | 'partially_refunded',
      });
    }
  }
  return result;
}

export async function loadCustomerOverview(
  access: Extract<CustomerCompanyAccess, { kind: 'authorized' }>,
) {
  const { tenant, session, company } = access;
  return settleCustomerWidgets({
    profile: getProfileCard(session.id),
    documentRequests: listOpenRequestsForCompany(tenant.id, company.id),
    documents: listDocumentsForCompany(tenant.id, company.id),
    renewals: listRenewalsForCompany(tenant.id, company.id),
    invoices: loadCustomerOverviewInvoices(tenant.id, company.id, session.id),
    assignment: readCurrentCompanyAssignment(company.id, session.id),
    communications: getCommsForCustomer(session.id, { limit: 5 }),
    employees: null,
    notifications: null,
  });
}
