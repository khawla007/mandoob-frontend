import 'server-only';

import { buildCustomerInvoiceOverview } from '@/lib/customer/customer-overview';
import { getCommsForCustomer } from './comms';
import type { CustomerCompanyAccess } from './customer-company-access';
import { getProfileCard } from './profile';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { settleCustomerWidgets } from '@/lib/customer/customer-overview';

const ROW_LIMIT = 6;
const INVOICE_TOTAL_LIMIT = 100;

type InvoiceRow = {
  id: string;
  label: string;
  amount_minor: number;
  currency: string;
  status: string;
  due_at: string | null;
};

function invoiceRow(row: InvoiceRow) {
  return {
    id: row.id,
    label: row.label,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    dueDate: row.due_at,
  };
}

async function loadCustomerOverviewInvoices(
  tenantId: string,
  companyId: string,
  profileId: string,
) {
  const admin = createSupabaseServiceRoleClient();
  const [openCountResult, recentResult] = await Promise.all([
    admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .eq('tenant_id', tenantId)
      .eq('company_id', companyId)
      .eq('customer_profile_id', profileId),
    admin
      .from('invoices')
      .select('id, label, amount_minor, currency, status, due_at')
      .eq('tenant_id', tenantId)
      .eq('company_id', companyId)
      .eq('customer_profile_id', profileId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(10),
  ]);
  if (openCountResult.error || openCountResult.count === null || recentResult.error) {
    throw new Error('CUSTOMER_INVOICES_UNAVAILABLE');
  }
  const exactOpenCount = openCountResult.count;
  let openRows: InvoiceRow[] = [];
  if (exactOpenCount <= INVOICE_TOTAL_LIMIT) {
    const result = await admin
      .from('invoices')
      .select('id, label, amount_minor, currency, status, due_at')
      .eq('status', 'open')
      .eq('tenant_id', tenantId)
      .eq('company_id', companyId)
      .eq('customer_profile_id', profileId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(INVOICE_TOTAL_LIMIT);
    if (result.error) throw new Error('CUSTOMER_INVOICES_UNAVAILABLE');
    openRows = (result.data ?? []) as InvoiceRow[];
  }
  return buildCustomerInvoiceOverview(
    exactOpenCount,
    openRows.map(invoiceRow),
    ((recentResult.data ?? []) as InvoiceRow[]).map(invoiceRow),
  );
}

async function loadCustomerOverviewDocuments(tenantId: string, companyId: string) {
  const admin = createSupabaseServiceRoleClient();
  const [requests, documents] = await Promise.all([
    admin
      .from('document_requests')
      .select('id, label, due_at, status')
      .eq('tenant_id', tenantId)
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(ROW_LIMIT + 1),
    admin
      .from('documents')
      .select('id, currentVersion:document_versions!documents_current_version_fk(review_status)')
      .eq('tenant_id', tenantId)
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(ROW_LIMIT + 1),
  ]);
  if (requests.error || documents.error) throw new Error('CUSTOMER_DOCUMENTS_UNAVAILABLE');
  type Document = { id: string; currentVersion: { review_status: string } | null };
  const requestRows = (requests.data ?? []).slice(0, ROW_LIMIT);
  const documentRows = ((documents.data ?? []) as unknown as Document[]).slice(0, ROW_LIMIT);
  const statuses = documentRows.map((row) => row.currentVersion?.review_status ?? 'submitted');
  return {
    requests: requestRows.map((row) => ({
      id: row.id,
      label: row.label,
      dueDate: row.due_at,
      status: row.status,
    })),
    recent: documentRows,
    summary: {
      kind: 'bounded' as const,
      requested: requestRows.length,
      submitted: documentRows.length,
      reviewed: statuses.filter((status) => status === 'approved' || status === 'rejected').length,
      rejected: statuses.filter((status) => status === 'rejected').length,
    },
    hasMore: (requests.data?.length ?? 0) > ROW_LIMIT || (documents.data?.length ?? 0) > ROW_LIMIT,
  };
}

async function loadCustomerOverviewRenewals(tenantId: string, companyId: string) {
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('renewals')
    .select('id, type, label, due_date, status')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .in('status', ['upcoming', 'due_soon', 'overdue'])
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(ROW_LIMIT + 1);
  if (error) throw new Error('CUSTOMER_RENEWALS_UNAVAILABLE');
  return { rows: (data ?? []).slice(0, ROW_LIMIT), hasMore: (data?.length ?? 0) > ROW_LIMIT };
}

export async function loadCustomerOverview(
  access: Extract<CustomerCompanyAccess, { kind: 'authorized' }>,
) {
  const { tenant, session, company } = access;
  return settleCustomerWidgets({
    profile: getProfileCard(session.id),
    documents: loadCustomerOverviewDocuments(tenant.id, company.id),
    renewals: loadCustomerOverviewRenewals(tenant.id, company.id),
    invoices: loadCustomerOverviewInvoices(tenant.id, company.id, session.id),
    assignment: null,
    communications: getCommsForCustomer(session.id, { limit: 5 }),
    employees: null,
    notifications: null,
  });
}
