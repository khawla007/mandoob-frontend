import 'server-only';

import {
  authorizeCustomerLinkedCompanyRead,
  type CustomerCompanyAccess,
} from '@/lib/data/customer-company-access';
import {
  normaliseCustomerInvoice,
  paymentAttemptState,
  type CustomerFinanceSearch,
  type CustomerInvoice,
  type CustomerInvoiceDbRow,
  type CustomerPaymentState,
  type CustomerProviderState,
} from '@/lib/customer/customer-finance';
import { signalBusinessDate } from '@/lib/data/signal-finance';

export const CUSTOMER_FINANCE_PAGE_SIZE = 25;

export type CustomerPaymentAttempt = {
  id: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  method: string | null;
  status: CustomerPaymentState;
  receivedAt: string | null;
  createdAt: string;
};
export type CustomerRefund = {
  id: string;
  paymentId: string;
  amountMinor: number;
  status: CustomerPaymentState;
  createdAt: string;
};
export type CustomerFinanceInvoice = CustomerInvoice & {
  latestPayment: CustomerPaymentAttempt | null;
};

type Scope = { tenantId: string; companyId: string; profileId: string };
type DbResult<T> = { data: T | null; count?: number | null; error: unknown | null };
type CountDbResult<T> = { data: T | null; count: number | null; error: unknown | null };
export type CustomerPaymentDbRow = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  amount_minor: number;
  currency: string;
  method: string | null;
  status: string;
  received_at: string | null;
  created_at: string;
};
export type CustomerRefundDbRow = {
  id: string;
  tenant_id: string;
  payment_id: string;
  amount_minor: number;
  status: string;
  created_at: string;
};
export type CustomerFinanceStore = {
  list: (
    input: Scope & { search: CustomerFinanceSearch; today: string; from: number; to: number },
  ) => Promise<CountDbResult<CustomerInvoiceDbRow[]>>;
  total: (input: Scope) => Promise<CountDbResult<never>>;
  payments: (tenantId: string, invoiceIds: string[]) => Promise<DbResult<CustomerPaymentDbRow[]>>;
  refunds: (tenantId: string, paymentIds: string[]) => Promise<DbResult<CustomerRefundDbRow[]>>;
  provider: (tenantId: string) => Promise<CustomerProviderState>;
  invoice: (input: Scope & { invoiceId: string }) => Promise<DbResult<CustomerInvoiceDbRow>>;
};
export type CustomerFinanceDependencies = {
  authorize?: (slug: string) => Promise<CustomerCompanyAccess>;
  store?: CustomerFinanceStore;
};

type FinanceBase = {
  rows: CustomerFinanceInvoice[];
  total: number | null;
  unfilteredTotal: number | null;
  page: number;
  canonicalPage: number;
  pageSize: number;
  provider: CustomerProviderState;
};
export type CustomerFinanceResult = FinanceBase & {
  state: 'ready' | 'empty' | 'no-results' | 'partial' | 'error' | 'unlinked' | 'permission';
};
export type CustomerInvoiceDetailResult =
  | {
      state: 'ready';
      invoice: CustomerInvoice;
      payments: CustomerPaymentAttempt[] | null;
      refunds: CustomerRefund[] | null;
      provider: CustomerProviderState;
    }
  | { state: 'not-found' | 'error' | 'unlinked' | 'permission' };

export async function listCustomerFinance(
  tenantSlug: string,
  search: CustomerFinanceSearch,
  dependencies: CustomerFinanceDependencies = {},
): Promise<CustomerFinanceResult> {
  const access = await (dependencies.authorize ?? authorizeCustomerLinkedCompanyRead)(tenantSlug);
  const unavailable: FinanceBase = {
    rows: [],
    total: null,
    unfilteredTotal: null,
    page: search.invoice ? 1 : search.page,
    canonicalPage: search.invoice ? 1 : search.page,
    pageSize: CUSTOMER_FINANCE_PAGE_SIZE,
    provider: 'unavailable',
  };
  if (access.kind === 'unlinked') return { ...unavailable, state: 'unlinked' };
  if (access.kind !== 'authorized') return { ...unavailable, state: 'permission' };

  const store = dependencies.store ?? createCustomerFinanceSupabaseStore(await serviceClient());
  const scope = {
    tenantId: access.tenant.id,
    companyId: access.company.id,
    profileId: access.session.id,
  };
  const page = search.invoice ? 1 : search.page;
  const from = (page - 1) * CUSTOMER_FINANCE_PAGE_SIZE;
  const [listed, total, provider] = await Promise.all([
    store
      .list({
        ...scope,
        search,
        today: signalBusinessDate(),
        from,
        to: from + CUSTOMER_FINANCE_PAGE_SIZE - 1,
      })
      .catch(() => ({ data: null, count: null, error: 'sanitized' })),
    store.total(scope).catch(() => ({ data: null, count: null, error: 'sanitized' })),
    store.provider(scope.tenantId).catch(() => 'error' as const),
  ]);
  if (listed.error || listed.count === null || !listed.data)
    return { ...unavailable, provider, state: 'error' };
  if (
    listed.data.some(
      (row) =>
        row.tenant_id !== scope.tenantId ||
        row.company_id !== scope.companyId ||
        row.customer_profile_id !== scope.profileId,
    )
  )
    return { ...unavailable, provider, state: 'error' };
  const invoices = listed.data.map(normaliseCustomerInvoice);
  if (invoices.some((invoice) => invoice === null))
    return { ...unavailable, provider, state: 'error' };

  const safeInvoices = invoices as CustomerInvoice[];
  const paymentResult = await store
    .payments(
      scope.tenantId,
      safeInvoices.map((invoice) => invoice.id),
    )
    .catch(() => ({ data: null, error: 'sanitized' }));
  const paymentOverflow = (paymentResult.data?.length ?? 0) > 100;
  const payments =
    paymentResult.error || paymentOverflow
      ? null
      : mapPayments(
          paymentResult.data ?? [],
          scope.tenantId,
          new Set(safeInvoices.map((invoice) => invoice.id)),
        );
  if (payments === false) return { ...unavailable, provider, state: 'error' };
  const latest = new Map<string, CustomerPaymentAttempt>();
  for (const payment of payments ?? [])
    if (!latest.has(payment.invoiceId)) latest.set(payment.invoiceId, payment);
  const rows = safeInvoices.map((invoice) => ({
    ...invoice,
    latestPayment: latest.get(invoice.id) ?? null,
  }));
  const canonicalPage = Math.min(
    page,
    Math.max(1, Math.ceil(listed.count / CUSTOMER_FINANCE_PAGE_SIZE)),
  );
  const base: FinanceBase = {
    rows,
    total: listed.count,
    unfilteredTotal: total.error || total.count === null ? null : total.count,
    page,
    canonicalPage,
    pageSize: CUSTOMER_FINANCE_PAGE_SIZE,
    provider,
  };
  if (
    paymentResult.error ||
    paymentOverflow ||
    total.error ||
    total.count === null ||
    provider === 'error'
  )
    return { ...base, state: 'partial' };
  if (listed.count === 0) return { ...base, state: total.count === 0 ? 'empty' : 'no-results' };
  return { ...base, state: 'ready' };
}

export async function loadCustomerInvoiceDetail(
  tenantSlug: string,
  invoiceId: string,
  dependencies: CustomerFinanceDependencies = {},
): Promise<CustomerInvoiceDetailResult> {
  const access = await (dependencies.authorize ?? authorizeCustomerLinkedCompanyRead)(tenantSlug);
  if (access.kind === 'unlinked') return { state: 'unlinked' };
  if (access.kind !== 'authorized') return { state: 'permission' };
  const store = dependencies.store ?? createCustomerFinanceSupabaseStore(await serviceClient());
  const scope = {
    tenantId: access.tenant.id,
    companyId: access.company.id,
    profileId: access.session.id,
  };
  const result = await store
    .invoice({ ...scope, invoiceId })
    .catch(() => ({ data: null, error: 'sanitized' }));
  if (result.error) return { state: 'error' };
  if (!result.data) return { state: 'not-found' };
  if (
    result.data.tenant_id !== scope.tenantId ||
    result.data.company_id !== scope.companyId ||
    result.data.customer_profile_id !== scope.profileId
  )
    return { state: 'not-found' };
  const invoice = normaliseCustomerInvoice(result.data);
  if (!invoice) return { state: 'error' };
  const [paymentResult, provider] = await Promise.all([
    store.payments(scope.tenantId, [invoice.id]).catch(() => ({ data: null, error: 'sanitized' })),
    store.provider(scope.tenantId).catch(() => 'error' as const),
  ]);
  const paymentOverflow = (paymentResult.data?.length ?? 0) > 100;
  const payments =
    paymentResult.error || paymentOverflow
      ? null
      : mapPayments(paymentResult.data ?? [], scope.tenantId, new Set([invoice.id]));
  if (payments === false) return { state: 'error' };
  let refunds: CustomerRefund[] | null = null;
  if (payments !== null) {
    const refundResult = await store
      .refunds(
        scope.tenantId,
        payments.map((payment) => payment.id),
      )
      .catch(() => ({ data: null, error: 'sanitized' }));
    if (!refundResult.error && (refundResult.data?.length ?? 0) <= 100) {
      const paymentIds = new Set(payments.map((payment) => payment.id));
      if (
        (refundResult.data ?? []).some(
          (row) =>
            row.tenant_id !== scope.tenantId ||
            !paymentIds.has(row.payment_id) ||
            !Number.isSafeInteger(row.amount_minor) ||
            row.amount_minor < 0,
        )
      )
        return { state: 'error' };
      const mappedRefunds = (refundResult.data ?? []).map((row) => ({
        id: row.id,
        paymentId: row.payment_id,
        amountMinor: row.amount_minor,
        status: paymentAttemptState(row.status),
        createdAt: row.created_at,
      }));
      if (mappedRefunds.some((refund) => refund.status === null)) return { state: 'error' };
      refunds = mappedRefunds as CustomerRefund[];
    }
  }
  return { state: 'ready', invoice, payments, refunds, provider };
}

function mapPayments(
  rows: CustomerPaymentDbRow[],
  tenantId: string,
  invoiceIds: Set<string>,
): CustomerPaymentAttempt[] | false {
  if (
    rows.some(
      (row) =>
        row.tenant_id !== tenantId ||
        !invoiceIds.has(row.invoice_id) ||
        !Number.isSafeInteger(row.amount_minor) ||
        row.amount_minor < 0 ||
        !/^[A-Z]{3}$/u.test(row.currency),
    )
  )
    return false;
  const mapped = rows.map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    method: row.method,
    status: paymentAttemptState(row.status),
    receivedAt: row.received_at,
    createdAt: row.created_at,
  }));
  if (mapped.some((payment) => payment.status === null)) return false;
  return mapped as CustomerPaymentAttempt[];
}

type Query = PromiseLike<unknown> & {
  select: (columns: string, options?: { count: 'exact'; head?: boolean }) => Query;
  eq: (column: string, value: string) => Query;
  in: (column: string, values: string[]) => Query;
  lt: (column: string, value: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (from: number, to: number) => Query;
  limit: (limit: number) => Query;
  maybeSingle: () => Query;
};
type Client = { from: (table: string) => Query };

async function serviceClient() {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient() as unknown as Client;
}

export function createCustomerFinanceSupabaseStore(client: Client): CustomerFinanceStore {
  const invoiceScope = (query: Query, input: Scope) =>
    query
      .eq('tenant_id', input.tenantId)
      .eq('company_id', input.companyId)
      .eq('customer_profile_id', input.profileId);
  return {
    list: async (input) => {
      let query = invoiceScope(
        client
          .from('invoices')
          .select(
            'id, tenant_id, company_id, customer_profile_id, label, amount_minor, currency, status, due_at, paid_at, created_at',
            { count: 'exact' },
          ),
        input,
      );
      if (input.search.invoice) query = query.eq('id', input.search.invoice);
      else if (input.search.status === 'open') query = query.eq('status', 'open');
      else if (input.search.status === 'overdue')
        query = query.eq('status', 'open').lt('due_at', input.today);
      else if (input.search.status === 'paid')
        query = query.in('status', ['paid', 'refunded', 'partially_refunded']);
      else if (input.search.status === 'cancelled') query = query.eq('status', 'void');
      return (await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(input.from, input.to)) as CountDbResult<CustomerInvoiceDbRow[]>;
    },
    total: async (input) =>
      (await invoiceScope(
        client.from('invoices').select('id', { count: 'exact', head: true }),
        input,
      )) as CountDbResult<never>,
    payments: async (tenantId, invoiceIds) => {
      if (!invoiceIds.length) return { data: [], error: null };
      return (await client
        .from('payments')
        .select(
          'id, tenant_id, invoice_id, amount_minor, currency, method, status, received_at, created_at',
        )
        .eq('tenant_id', tenantId)
        .in('invoice_id', invoiceIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(101)) as DbResult<CustomerPaymentDbRow[]>;
    },
    refunds: async (tenantId, paymentIds) => {
      if (!paymentIds.length) return { data: [], error: null };
      return (await client
        .from('refunds')
        .select('id, tenant_id, payment_id, amount_minor, status, created_at')
        .eq('tenant_id', tenantId)
        .in('payment_id', paymentIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(101)) as DbResult<CustomerRefundDbRow[]>;
    },
    provider: async (tenantId) => {
      const { resolveTenantTapConfig } = await import('@/lib/payments/config');
      const config = await resolveTenantTapConfig(tenantId);
      return config?.enabled ? 'configured' : 'unavailable';
    },
    invoice: async (input) =>
      (await invoiceScope(
        client
          .from('invoices')
          .select(
            'id, tenant_id, company_id, customer_profile_id, label, amount_minor, currency, status, due_at, paid_at, created_at',
          ),
        input,
      )
        .eq('id', input.invoiceId)
        .maybeSingle()) as DbResult<CustomerInvoiceDbRow>,
  };
}
