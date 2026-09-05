import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { buildCustomerInvoiceOverview } from '@/lib/customer/customer-overview';
import type { CustomerCompanyAccess } from './customer-company-access';
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

type OverviewQueryResult<T> = {
  data: T[] | null;
  count: number | null;
  error: unknown;
};

type DocumentRequestRow = {
  id: string;
  label: string;
  due_at: string | null;
  status: string;
};

type DocumentRow = {
  id: string;
  currentVersion: { review_status: string } | { review_status: string }[] | null;
};

type RenewalRow = {
  id: string;
  type: string;
  label: string;
  due_date: string | null;
  status: string;
};

export type CustomerOverviewStore = {
  invoiceOpenCount: (
    tenantId: string,
    companyId: string,
    profileId: string,
  ) => Promise<OverviewQueryResult<{ id: string }>>;
  invoiceRecent: (
    tenantId: string,
    companyId: string,
    profileId: string,
  ) => Promise<OverviewQueryResult<InvoiceRow>>;
  invoiceOpenRows: (
    tenantId: string,
    companyId: string,
    profileId: string,
  ) => Promise<OverviewQueryResult<InvoiceRow>>;
  documentRequests: (
    tenantId: string,
    companyId: string,
  ) => Promise<OverviewQueryResult<DocumentRequestRow>>;
  documents: (tenantId: string, companyId: string) => Promise<OverviewQueryResult<DocumentRow>>;
  renewals: (tenantId: string, companyId: string) => Promise<OverviewQueryResult<RenewalRow>>;
  employeeCount: (
    tenantId: string,
    companyId: string,
  ) => Promise<OverviewQueryResult<{ id: string }>>;
};

export function createCustomerOverviewSupabaseStore(
  client: Pick<SupabaseClient, 'from'>,
): CustomerOverviewStore {
  return {
    invoiceOpenCount: async (tenantId, companyId, profileId) =>
      await client
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('customer_profile_id', profileId),
    invoiceRecent: async (tenantId, companyId, profileId) =>
      await client
        .from('invoices')
        .select('id, label, amount_minor, currency, status, due_at')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('customer_profile_id', profileId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(10),
    invoiceOpenRows: async (tenantId, companyId, profileId) =>
      await client
        .from('invoices')
        .select('id, label, amount_minor, currency, status, due_at')
        .eq('status', 'open')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('customer_profile_id', profileId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(INVOICE_TOTAL_LIMIT),
    documentRequests: async (tenantId, companyId) =>
      await client
        .from('document_requests')
        .select('id, label, due_at, status')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(ROW_LIMIT + 1),
    documents: async (tenantId, companyId) =>
      await client
        .from('documents')
        .select('id, currentVersion:document_versions!documents_current_version_fk(review_status)')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(ROW_LIMIT + 1),
    renewals: async (tenantId, companyId) =>
      await client
        .from('renewals')
        .select('id, type, label, due_date, status')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .in('status', ['upcoming', 'due_soon', 'overdue'])
        .order('due_date', { ascending: true })
        .order('id', { ascending: true })
        .limit(ROW_LIMIT + 1),
    employeeCount: async (tenantId, companyId) =>
      await client
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId),
  };
}

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
  store: CustomerOverviewStore,
  tenantId: string,
  companyId: string,
  profileId: string,
) {
  const [openCountResult, recentResult] = await Promise.all([
    store.invoiceOpenCount(tenantId, companyId, profileId),
    store.invoiceRecent(tenantId, companyId, profileId),
  ]);
  if (openCountResult.error || openCountResult.count === null || recentResult.error) {
    throw new Error('CUSTOMER_INVOICES_UNAVAILABLE');
  }
  const exactOpenCount = openCountResult.count;
  let openRows: InvoiceRow[] = [];
  if (exactOpenCount <= INVOICE_TOTAL_LIMIT) {
    const result = await store.invoiceOpenRows(tenantId, companyId, profileId);
    if (result.error) throw new Error('CUSTOMER_INVOICES_UNAVAILABLE');
    openRows = (result.data ?? []) as InvoiceRow[];
  }
  return buildCustomerInvoiceOverview(
    exactOpenCount,
    openRows.map(invoiceRow),
    ((recentResult.data ?? []) as InvoiceRow[]).map(invoiceRow),
  );
}

async function loadCustomerOverviewDocumentRequests(
  store: CustomerOverviewStore,
  tenantId: string,
  companyId: string,
) {
  const { data, error } = await store.documentRequests(tenantId, companyId);
  if (error) throw new Error('CUSTOMER_DOCUMENT_REQUESTS_UNAVAILABLE');
  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    dueDate: row.due_at,
    status: row.status,
  }));
}

async function loadCustomerOverviewDocuments(
  store: CustomerOverviewStore,
  tenantId: string,
  companyId: string,
) {
  const { data, error } = await store.documents(tenantId, companyId);
  if (error) throw new Error('CUSTOMER_DOCUMENTS_UNAVAILABLE');
  return (data ?? []).map((row) => {
    const version = Array.isArray(row.currentVersion) ? row.currentVersion[0] : row.currentVersion;
    return {
      id: row.id,
      reviewStatus: version?.review_status ?? 'submitted',
    };
  });
}

async function loadCustomerOverviewRenewals(
  store: CustomerOverviewStore,
  tenantId: string,
  companyId: string,
) {
  const { data, error } = await store.renewals(tenantId, companyId);
  if (error) throw new Error('CUSTOMER_RENEWALS_UNAVAILABLE');
  return { rows: (data ?? []).slice(0, ROW_LIMIT), hasMore: (data?.length ?? 0) > ROW_LIMIT };
}

async function loadCustomerOverviewEmployeeCount(
  store: CustomerOverviewStore,
  tenantId: string,
  companyId: string,
) {
  const { count, error } = await store.employeeCount(tenantId, companyId);
  if (error || count === null || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('CUSTOMER_EMPLOYEES_UNAVAILABLE');
  }
  return count;
}

export async function loadCustomerOverview(
  access: Extract<CustomerCompanyAccess, { kind: 'authorized' }>,
  dependencies: { store?: CustomerOverviewStore } = {},
) {
  const { tenant, session, company } = access;
  const store = dependencies.store ?? (await createDefaultCustomerOverviewStore());
  return settleCustomerWidgets({
    documentRequests: loadCustomerOverviewDocumentRequests(store, tenant.id, company.id),
    documents: loadCustomerOverviewDocuments(store, tenant.id, company.id),
    renewals: loadCustomerOverviewRenewals(store, tenant.id, company.id),
    invoices: loadCustomerOverviewInvoices(store, tenant.id, company.id, session.id),
    assignment: null,
    communications: null,
    employees: loadCustomerOverviewEmployeeCount(store, tenant.id, company.id),
    notifications: null,
  });
}

async function createDefaultCustomerOverviewStore(): Promise<CustomerOverviewStore> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createCustomerOverviewSupabaseStore(createSupabaseServiceRoleClient());
}
