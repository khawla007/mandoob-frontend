import 'server-only';
import { formatMoney } from '@/lib/format/money';
import { isReceiptEligible } from '@/lib/pdf/receipt';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { signalBusinessDate } from './signal-finance';
import type { PaymentSignalView } from '@/lib/signal-studio-filters';
import { selectRefundablePayment, resolveInvoiceFinanceSections } from './invoice-finance-state';
import { refundOperationFromRow, type RefundOperationState } from './refund-operation-state';
import { parseInvoiceRpcWindow } from './invoice-rpc-validation';

export type ProInvoiceRow = {
  id: string;
  version: number;
  paymentId: string | null;
  companyId: string;
  companyName: string;
  customerProfileId: string | null;
  label: string;
  amount: string;
  amountMinor: number;
  outstandingMinor: number;
  currency: string;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  refundOperation: RefundOperationState | null;
  remainingRefundableMinor: number | null;
  refundDetailsLoaded: boolean;
  receiptAvailable: boolean;
};

export type { RefundOperationState } from './refund-operation-state';

export type PaymentInvoicePage = {
  rows: ProInvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
  currency: string;
  nextCursor: { createdAt: string; id: string } | null;
};

const PAYMENT_INVOICE_PAGE_SIZE = 50;
type PaymentFilterInvoice = {
  id: string;
  version: number;
  tenant_id: string;
  company_id: string;
  customer_profile_id: string | null;
  label: string;
  amount_minor: number;
  outstanding_minor: number;
  currency: string;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  receipt_available: boolean;
};
type PaymentRpcResult = {
  rows: PaymentFilterInvoice[];
  total: number;
  page: number;
  pageSize: number;
  currency: string;
};

export async function listInvoicesForPaymentView(
  tenantId: string,
  companyId: string,
  actorId: string,
  options: {
    view: PaymentSignalView | 'all';
    page?: number;
    today?: string;
    date?: string;
    period?: 'morning' | 'afternoon';
    cursor?: { createdAt: string; id: string } | null;
  } = { view: 'all' },
): Promise<PaymentInvoicePage> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.rpc(
    'p309_list_company_invoices' as never,
    {
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_actor_id: actorId,
      p_before_created_at: options.cursor?.createdAt ?? null,
      p_before_id: options.cursor?.id ?? null,
      p_limit: PAYMENT_INVOICE_PAGE_SIZE,
      p_view: options.view,
      p_today: options.today ?? signalBusinessDate(),
      p_date: options.date ?? null,
      p_period: options.period ?? null,
    } as never,
  );
  if (error) throw new Error(error.message);
  const window = parseInvoiceRpcWindow(data) as unknown as {
    rows: PaymentFilterInvoice[];
    total: number;
  };
  const rows = window.rows;
  if (rows.some((row) => typeof row.receipt_available !== 'boolean'))
    throw new Error('INVOICE_SOURCE_UNAVAILABLE');
  const last = rows.at(-1);
  const result: PaymentRpcResult = {
    rows,
    total: window.total,
    page: Math.max(1, Math.trunc(options.page ?? 1)),
    pageSize: PAYMENT_INVOICE_PAGE_SIZE,
    currency: rows[0]?.currency ?? 'AED',
  };
  const selected = result.rows;
  const companyNames = await getCompanyNames(
    admin,
    Array.from(new Set(selected.map((row) => row.company_id))),
  );
  const refundOperations = await getLatestRefundOperations(
    admin,
    tenantId,
    selected.map((row) => row.id),
  );
  return {
    rows: selected.map((row) => ({
      id: row.id,
      version: row.version,
      paymentId: null,
      companyId: row.company_id,
      companyName: companyNames.get(row.company_id) ?? 'Unknown company',
      customerProfileId: row.customer_profile_id ?? null,
      label: row.label,
      amount: formatMoney(row.amount_minor, row.currency),
      amountMinor: row.amount_minor,
      outstandingMinor: row.outstanding_minor,
      currency: row.currency,
      status: row.status,
      dueAt: row.due_at ?? null,
      paidAt: row.paid_at ?? null,
      createdAt: row.created_at,
      refundOperation: refundOperations.get(row.id) ?? null,
      remainingRefundableMinor: null,
      refundDetailsLoaded: true,
      receiptAvailable: row.receipt_available,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    currency: result.currency,
    nextCursor:
      rows.length === PAYMENT_INVOICE_PAGE_SIZE && last
        ? { createdAt: last.created_at, id: last.id }
        : null,
  };
}
export type ReceiptPayload = {
  tenantName: string;
  tenantColor: string | null;
  companyName: string;
  customerName: string | null;
  invoiceId: string;
  label: string;
  amount: string;
  status: string;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentProvider: string | null;
  refunds: { amount: string; reason: string | null; status: string }[];
};

export type InvoiceDetail = ProInvoiceRow & {
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  payments: {
    id: string;
    provider: string;
    method: string | null;
    status: string;
    amount: string;
    receivedAt: string | null;
    createdAt: string;
    context: 'success' | 'failure' | 'pending' | 'refunded';
  }[];
  refunds: {
    id: string;
    amount: string;
    reason: string | null;
    status: string;
    createdAt: string;
    currency: string;
  }[];
  audit: { id: string; action: string; createdAt: string }[];
  sections: {
    payments: 'available' | 'unavailable';
    refunds: 'available' | 'unavailable';
    refundOperation: 'available' | 'unavailable';
    audit: 'available' | 'unavailable';
  };
};

export async function listInvoicesForTenant(
  tenantId: string,
  opts: { companyId?: string; limit?: number } = {},
): Promise<ProInvoiceRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('invoices')
    .select(
      'id, company_id, customer_profile_id, label, amount_minor, currency, status, due_at, paid_at, created_at, version',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.companyId) query = query.eq('company_id', opts.companyId);

  const { data } = await query;
  const rows = data ?? [];
  const companyIds = Array.from(new Set(rows.map((r) => r.company_id as string)));
  const companyNames = await getCompanyNames(admin, companyIds);
  const refundOperations = await getLatestRefundOperations(
    admin,
    tenantId,
    rows.map((row) => row.id as string),
  );

  return rows.map((r) => ({
    id: r.id as string,
    version: (r.version as number | undefined) ?? 0,
    paymentId: null,
    companyId: r.company_id as string,
    companyName: companyNames.get(r.company_id as string) ?? 'Unknown company',
    customerProfileId: (r.customer_profile_id as string | null) ?? null,
    label: r.label as string,
    amount: formatMoney(r.amount_minor as number, r.currency as string),
    amountMinor: r.amount_minor as number,
    outstandingMinor: r.amount_minor as number,
    currency: r.currency as string,
    status: r.status as string,
    dueAt: (r.due_at as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    createdAt: r.created_at as string,
    refundOperation: refundOperations.get(r.id as string) ?? null,
    remainingRefundableMinor: null,
    refundDetailsLoaded: true,
    receiptAvailable: false,
  }));
}

export async function countOpenInvoicesForTenant(tenantId: string): Promise<number> {
  const admin = createSupabaseServiceRoleClient();
  const { count } = await admin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'open');
  return count ?? 0;
}

export async function getReceiptPayloadForTenant(
  tenantId: string,
  companyId: string,
  invoiceId: string,
): Promise<ReceiptPayload | null> {
  const admin = createSupabaseServiceRoleClient();
  const payload = await loadReceiptPayload(admin, tenantId, invoiceId, companyId);
  return payload;
}

export async function getInvoiceDetailForTenant(
  tenantId: string,
  companyId: string,
  actorId: string,
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.rpc(
    'p309_get_company_invoice' as never,
    {
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_actor_id: actorId,
      p_invoice_id: invoiceId,
    } as never,
  );
  if (error || !data || typeof data !== 'object') return null;
  const invoice = data as unknown as PaymentFilterInvoice & {
    linked_entity_type: string | null;
    linked_entity_id: string | null;
  };
  if (
    invoice.id !== invoiceId ||
    invoice.tenant_id !== tenantId ||
    invoice.company_id !== companyId ||
    typeof invoice.receipt_available !== 'boolean'
  )
    return null;

  const [companyNames, paymentsResult, auditResult] = await Promise.all([
    getCompanyNames(admin, [invoice.company_id as string]),
    admin
      .from('payments')
      .select('id, provider, method, status, amount_minor, currency, received_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false }),
    admin
      .from('tenant_audit_log')
      .select('id, action, created_at')
      .eq('tenant_id', tenantId)
      .contains('details', { invoice_id: invoiceId })
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const paymentIds = paymentsResult.error
    ? []
    : (paymentsResult.data ?? []).map((p) => p.id as string);
  const refundsResult =
    !paymentsResult.error && paymentIds.length
      ? await admin
          .from('refunds')
          .select('id, payment_id, idempotency_key, status, amount_minor, reason, created_at')
          .eq('tenant_id', tenantId)
          .in('payment_id', paymentIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null };
  const refunds = refundsResult.data ?? [];
  const sections = resolveInvoiceFinanceSections({
    payments: !paymentsResult.error,
    refunds: !refundsResult.error,
    refundOperation: !refundsResult.error,
    audit: !auditResult.error,
  });
  const invoiceCurrency = invoice.currency as string;
  const allocatedMinor = (paymentsResult.data ?? [])
    .filter((payment) =>
      ['succeeded', 'partially_refunded', 'refunded'].includes(payment.status as string),
    )
    .reduce((total, payment) => total + (payment.amount_minor as number), 0);
  const refundable =
    sections.refundOperation === 'available'
      ? selectRefundablePayment({
          currency: invoiceCurrency,
          payments: (paymentsResult.data ?? []).map((payment) => ({
            id: payment.id as string,
            amountMinor: payment.amount_minor as number,
            currency: payment.currency as string,
            status: payment.status as string,
            createdAt: payment.created_at as string,
          })),
          refunds: refunds.map((refund) => ({
            paymentId: refund.payment_id as string,
            amountMinor: refund.amount_minor as number,
            status: refund.status as string,
          })),
        })
      : null;

  return {
    id: invoice.id as string,
    version: (invoice.version as number | undefined) ?? 0,
    paymentId: refundable?.paymentId ?? null,
    companyId: invoice.company_id as string,
    companyName: companyNames.get(invoice.company_id as string) ?? 'Unknown company',
    customerProfileId: (invoice.customer_profile_id as string | null) ?? null,
    label: invoice.label as string,
    amount: formatMoney(invoice.amount_minor as number, invoice.currency as string),
    amountMinor: invoice.amount_minor as number,
    outstandingMinor: Math.max(0, (invoice.amount_minor as number) - allocatedMinor),
    currency: invoiceCurrency,
    status: invoice.status as string,
    dueAt: (invoice.due_at as string | null) ?? null,
    paidAt: (invoice.paid_at as string | null) ?? null,
    createdAt: invoice.created_at as string,
    refundOperation:
      sections.refundOperation === 'available'
        ? mapRefundOperation(refunds.find((refund) => refund.idempotency_key))
        : null,
    remainingRefundableMinor: refundable?.remainingMinor ?? null,
    refundDetailsLoaded: sections.refundOperation === 'available',
    receiptAvailable: invoice.receipt_available,
    linkedEntityType: (invoice.linked_entity_type as string | null) ?? null,
    linkedEntityId: (invoice.linked_entity_id as string | null) ?? null,
    payments: (paymentsResult.data ?? []).map((p) => ({
      id: p.id as string,
      provider: paymentProviderCode(p.provider as string),
      method: (p.method as string | null) ?? null,
      status: p.status as string,
      amount: formatMoney(p.amount_minor as number, p.currency as string),
      receivedAt: (p.received_at as string | null) ?? null,
      createdAt: p.created_at as string,
      context: paymentAttemptContext(p.status as string),
    })),
    refunds: (refunds ?? []).map((r) => ({
      id: r.id as string,
      amount: formatMoney(r.amount_minor as number, invoice.currency as string),
      reason: (r.reason as string | null) ?? null,
      status: r.status as string,
      createdAt: r.created_at as string,
      currency: invoiceCurrency,
    })),
    audit: (auditResult.data ?? []).map((a) => ({
      id: String(a.id),
      action: a.action as string,
      createdAt: a.created_at as string,
    })),
    sections,
  };
}

function paymentAttemptContext(status: string): 'success' | 'failure' | 'pending' | 'refunded' {
  if (status === 'succeeded') return 'success';
  if (status === 'partially_refunded' || status === 'refunded') return 'refunded';
  if (status === 'failed' || status === 'abandoned') return 'failure';
  return 'pending';
}

function paymentProviderCode(provider: string): string {
  return provider === 'tap' || provider === 'manual' ? provider : 'unknown';
}

export async function getReceiptPayloadForCustomer(
  tenantId: string,
  companyId: string,
  invoiceId: string,
  profileId: string,
  adminOverride?: Admin,
): Promise<ReceiptPayload | null> {
  const admin = adminOverride ?? createSupabaseServiceRoleClient();
  const { data: invoice, error } = await admin
    .from('invoices')
    .select('customer_profile_id')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .eq('id', invoiceId)
    .maybeSingle();
  if (error || !invoice || invoice.customer_profile_id !== profileId) return null;
  return loadReceiptPayload(admin, tenantId, invoiceId, companyId);
}

type Admin = ReturnType<typeof createSupabaseServiceRoleClient>;

async function getLatestRefundOperations(
  admin: Admin,
  tenantId: string,
  invoiceIds: string[],
): Promise<Map<string, RefundOperationState>> {
  if (invoiceIds.length === 0) return new Map();
  const { data: payments, error: paymentError } = await admin
    .from('payments')
    .select('id, invoice_id')
    .eq('tenant_id', tenantId)
    .in('invoice_id', invoiceIds);
  if (paymentError) throw new Error(paymentError.message);
  const paymentToInvoice = new Map(
    (payments ?? []).map((payment) => [payment.id as string, payment.invoice_id as string]),
  );
  if (paymentToInvoice.size === 0) return new Map();
  const { data: refunds, error: refundError } = await admin
    .from('refunds')
    .select('id, payment_id, idempotency_key, status, amount_minor, reason, created_at')
    .eq('tenant_id', tenantId)
    .in('payment_id', [...paymentToInvoice.keys()])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (refundError) throw new Error(refundError.message);

  const result = new Map<string, RefundOperationState>();
  for (const refund of refunds ?? []) {
    const invoiceId = paymentToInvoice.get(refund.payment_id as string);
    if (!invoiceId || result.has(invoiceId)) continue;
    const operation = mapRefundOperation(refund);
    if (operation) result.set(invoiceId, operation);
  }
  return result;
}

function mapRefundOperation(
  refund:
    | {
        payment_id?: string | null;
        idempotency_key?: string | null;
        status?: string | null;
        amount_minor?: number | null;
        reason?: string | null;
      }
    | undefined,
): RefundOperationState | null {
  return refundOperationFromRow(refund ?? {});
}

async function getCompanyNames(admin: Admin, companyIds: string[]): Promise<Map<string, string>> {
  if (companyIds.length === 0) return new Map();
  const { data } = await admin
    .from('company_profiles')
    .select('id, company_name')
    .in('id', companyIds);
  return new Map((data ?? []).map((r) => [r.id as string, r.company_name as string]));
}

async function loadReceiptPayload(
  admin: Admin,
  tenantId: string,
  invoiceId: string,
  companyId?: string,
): Promise<ReceiptPayload | null> {
  let invoiceQuery = admin
    .from('invoices')
    .select('id, company_id, customer_profile_id, label, amount_minor, currency, status, paid_at')
    .eq('tenant_id', tenantId)
    .eq('id', invoiceId);
  if (companyId) invoiceQuery = invoiceQuery.eq('company_id', companyId);
  const { data: invoice, error: invoiceError } = await invoiceQuery.maybeSingle();
  if (invoiceError || !invoice) return null;
  if (!isReceiptEligible(invoice.status as string)) return null;
  if (
    !Number.isSafeInteger(invoice.amount_minor) ||
    (invoice.amount_minor as number) < 0 ||
    !/^[A-Z]{3}$/u.test(invoice.currency as string)
  )
    return null;

  const [tenantResult, companyResult, paymentResult] = await Promise.all([
    admin.from('tenants').select('name, primary_color').eq('id', tenantId).maybeSingle(),
    admin
      .from('company_profiles')
      .select('company_name')
      .eq('tenant_id', tenantId)
      .eq('id', invoice.company_id as string)
      .maybeSingle(),
    admin
      .from('payments')
      .select('id, provider, method, status, received_at')
      .eq('tenant_id', tenantId)
      .eq('invoice_id', invoiceId)
      .in('status', ['succeeded', 'refunded', 'partially_refunded'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (
    tenantResult.error ||
    companyResult.error ||
    paymentResult.error ||
    !tenantResult.data?.name ||
    !companyResult.data?.company_name ||
    !paymentResult.data
  )
    return null;
  const tenant = tenantResult.data;
  const company = companyResult.data;
  const payment = paymentResult.data;

  const { data: refunds, error: refundsError } = payment?.id
    ? await admin
        .from('refunds')
        .select('amount_minor, reason, status')
        .eq('tenant_id', tenantId)
        .eq('payment_id', payment.id as string)
        .order('created_at', { ascending: false })
        .limit(101)
    : { data: [], error: null };
  if (
    refundsError ||
    (refunds?.length ?? 0) > 100 ||
    (refunds ?? []).some(
      (refund) => !Number.isSafeInteger(refund.amount_minor) || (refund.amount_minor as number) < 0,
    )
  )
    return null;

  let customerName: string | null = null;
  if (invoice.customer_profile_id) {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('full_name, tenant_id')
      .eq('tenant_id', tenantId)
      .eq('id', invoice.customer_profile_id as string)
      .maybeSingle();
    if (profileError || !profile || profile.tenant_id !== tenantId) return null;
    customerName = (profile?.full_name as string | null) ?? null;
  }

  return {
    tenantName: tenant.name as string,
    tenantColor: (tenant.primary_color as string | null) ?? null,
    companyName: company.company_name as string,
    customerName,
    invoiceId: invoice.id as string,
    label: invoice.label as string,
    amount: formatMoney(invoice.amount_minor as number, invoice.currency as string),
    status: invoice.status as string,
    paidAt: (invoice.paid_at as string | null) ?? (payment.received_at as string | null) ?? null,
    paymentMethod: (payment.method as string | null) ?? null,
    paymentProvider: payment.provider as string,
    refunds: (refunds ?? []).map((r) => ({
      amount: formatMoney(r.amount_minor as number, invoice.currency as string),
      reason: (r.reason as string | null) ?? null,
      status: r.status as string,
    })),
  };
}
