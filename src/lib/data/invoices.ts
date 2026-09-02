import 'server-only';
import { enqueueEmail } from '@/lib/mail/send';
import { formatMoney } from '@/lib/format/money';
import { isReceiptEligible } from '@/lib/pdf/receipt';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { signalBusinessDate } from './signal-finance';
import type { PaymentSignalView } from '@/lib/signal-studio-filters';
import { remainingRefundableMinor, resolveInvoiceFinanceSections } from './invoice-finance-state';
import { createInvoiceFailure } from './create-invoice-result';

export type LinkedEntity = {
  type: 'renewal' | 'document_request' | 'manual';
  id: string;
};

export type CreateInvoiceArgs = {
  tenantId: string;
  companyId: string;
  customerProfileId?: string | null;
  linked?: LinkedEntity;
  label: string;
  amountMinor: bigint | number;
  currency?: string;
  dueAt?: Date | string | null;
  createdBy?: string | null;
};

export type CreateInvoiceResult =
  | { ok: true; data: { id: string; emailQueueId: number | null } }
  | { ok: false; error: string; code: string };

export type ProInvoiceRow = {
  id: string;
  companyId: string;
  companyName: string;
  customerProfileId: string | null;
  label: string;
  amount: string;
  amountMinor: number;
  currency: string;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  refundOperation: RefundOperationState | null;
  remainingRefundableMinor: number | null;
  refundAvailable: boolean;
};

export type RefundOperationState = {
  operationId: string;
  status: 'pending' | 'succeeded' | 'failed';
  amountMinor: number;
  reason: string | null;
};

export type PaymentInvoicePage = {
  rows: ProInvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
  currency: string;
};

const PAYMENT_INVOICE_PAGE_SIZE = 50;
type PaymentFilterInvoice = {
  id: string;
  tenant_id: string;
  company_id: string;
  customer_profile_id: string | null;
  label: string;
  amount_minor: number;
  currency: string;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
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
  options: {
    view: PaymentSignalView | 'all';
    page?: number;
    today?: string;
    date?: string;
    period?: 'morning' | 'afternoon';
  } = { view: 'all' },
): Promise<PaymentInvoicePage> {
  const admin = createSupabaseServiceRoleClient();
  const requestedPage = Math.max(1, Math.trunc(options.page ?? 1));
  let result: PaymentRpcResult;
  if (options.view === 'all') {
    const load = (page: number) =>
      admin
        .from('invoices')
        .select(
          'id, tenant_id, company_id, customer_profile_id, label, amount_minor, currency, status, due_at, paid_at, created_at',
          { count: 'exact' },
        )
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range((page - 1) * PAYMENT_INVOICE_PAGE_SIZE, page * PAYMENT_INVOICE_PAGE_SIZE - 1);
    let query = await load(requestedPage);
    if (query.error) throw new Error(query.error.message);
    const total = query.count ?? 0;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PAYMENT_INVOICE_PAGE_SIZE)));
    if (page !== requestedPage) query = await load(page);
    if (query.error) throw new Error(query.error.message);
    const rows = (query.data ?? []) as PaymentFilterInvoice[];
    result = {
      rows,
      total,
      page,
      pageSize: PAYMENT_INVOICE_PAGE_SIZE,
      currency: rows.find((row) => row.currency === 'AED')?.currency ?? rows[0]?.currency ?? 'AED',
    };
  } else {
    const { data, error } = await admin.rpc(
      'list_company_payment_invoices' as never,
      {
        p_tenant_id: tenantId,
        p_company_id: companyId,
        p_view: options.view,
        p_page: requestedPage,
        p_page_size: PAYMENT_INVOICE_PAGE_SIZE,
        p_today: options.today ?? signalBusinessDate(),
        p_date: options.date ?? null,
        p_period: options.period ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    result = data as unknown as PaymentRpcResult;
  }
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
      companyId: row.company_id,
      companyName: companyNames.get(row.company_id) ?? 'Unknown company',
      customerProfileId: row.customer_profile_id ?? null,
      label: row.label,
      amount: formatMoney(row.amount_minor, row.currency),
      amountMinor: row.amount_minor,
      currency: row.currency,
      status: row.status,
      dueAt: row.due_at ?? null,
      paidAt: row.paid_at ?? null,
      createdAt: row.created_at,
      refundOperation: refundOperations.get(row.id) ?? null,
      remainingRefundableMinor: null,
      refundAvailable: false,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    currency: result.currency,
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
  audit: { id: string; action: string; createdAt: string; details: unknown }[];
  sections: {
    payments: 'available' | 'unavailable';
    refunds: 'available' | 'unavailable';
    refundOperation: 'available' | 'unavailable';
    audit: 'available' | 'unavailable';
  };
};

export async function createInvoice(args: CreateInvoiceArgs): Promise<CreateInvoiceResult> {
  if (typeof args.amountMinor === 'bigint' && args.amountMinor < BigInt(0)) {
    return { ok: false, error: 'amount cannot be negative', code: 'INVALID_AMOUNT' };
  }
  if (typeof args.amountMinor === 'number' && args.amountMinor < 0) {
    return { ok: false, error: 'amount cannot be negative', code: 'INVALID_AMOUNT' };
  }

  const admin = createSupabaseServiceRoleClient();
  const currency = (args.currency ?? 'AED').toUpperCase();

  const customerProfileId =
    args.customerProfileId ?? (await resolveCustomerProfileId(admin, args.companyId));

  const dueAtIso = normaliseDueAt(args.dueAt);
  const linkedEntityType = args.linked?.type ?? 'manual';
  const linkedEntityId = args.linked?.id ?? null;
  const { data: insertedId, error } = await admin.rpc('create_company_invoice', {
    p_tenant_id: args.tenantId,
    p_company_id: args.companyId,
    p_customer_profile_id: customerProfileId,
    p_linked_entity_type: linkedEntityType,
    p_linked_entity_id: linkedEntityId,
    p_label: args.label,
    p_amount_minor: Number(args.amountMinor),
    p_currency: currency,
    p_due_at: dueAtIso,
    p_created_by: args.createdBy ?? null,
  });

  if (error || !insertedId) {
    return createInvoiceFailure(error);
  }

  const emailQueueId = await fanOutInvoiceDueEmail({
    admin,
    invoiceId: insertedId,
    tenantId: args.tenantId,
    companyId: args.companyId,
    customerProfileId,
    label: args.label,
    amountMinor: args.amountMinor,
    currency,
  });

  return { ok: true, data: { id: insertedId, emailQueueId } };
}

export async function listInvoicesForTenant(
  tenantId: string,
  opts: { companyId?: string; limit?: number } = {},
): Promise<ProInvoiceRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('invoices')
    .select(
      'id, company_id, customer_profile_id, label, amount_minor, currency, status, due_at, paid_at, created_at',
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
    companyId: r.company_id as string,
    companyName: companyNames.get(r.company_id as string) ?? 'Unknown company',
    customerProfileId: (r.customer_profile_id as string | null) ?? null,
    label: r.label as string,
    amount: formatMoney(r.amount_minor as number, r.currency as string),
    amountMinor: r.amount_minor as number,
    currency: r.currency as string,
    status: r.status as string,
    dueAt: (r.due_at as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    createdAt: r.created_at as string,
    refundOperation: refundOperations.get(r.id as string) ?? null,
    remainingRefundableMinor: null,
    refundAvailable: false,
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
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: invoice } = await admin
    .from('invoices')
    .select(
      'id, company_id, customer_profile_id, linked_entity_type, linked_entity_id, label, amount_minor, currency, status, due_at, paid_at, created_at',
    )
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return null;

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
      .select('id, action, created_at, details')
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
  const remaining =
    sections.refundOperation === 'available'
      ? remainingRefundableMinor({
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
    companyId: invoice.company_id as string,
    companyName: companyNames.get(invoice.company_id as string) ?? 'Unknown company',
    customerProfileId: (invoice.customer_profile_id as string | null) ?? null,
    label: invoice.label as string,
    amount: formatMoney(invoice.amount_minor as number, invoice.currency as string),
    amountMinor: invoice.amount_minor as number,
    currency: invoiceCurrency,
    status: invoice.status as string,
    dueAt: (invoice.due_at as string | null) ?? null,
    paidAt: (invoice.paid_at as string | null) ?? null,
    createdAt: invoice.created_at as string,
    refundOperation:
      sections.refundOperation === 'available'
        ? mapRefundOperation(refunds.find((refund) => refund.idempotency_key))
        : null,
    remainingRefundableMinor: remaining,
    refundAvailable: remaining !== null,
    linkedEntityType: (invoice.linked_entity_type as string | null) ?? null,
    linkedEntityId: (invoice.linked_entity_id as string | null) ?? null,
    payments: (paymentsResult.data ?? []).map((p) => ({
      id: p.id as string,
      provider: paymentProviderLabel(p.provider as string),
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
      details: a.details,
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

function paymentProviderLabel(provider: string): string {
  if (provider === 'tap') return 'Tap';
  if (provider === 'manual') return 'Manual';
  return 'Payment provider';
}

export async function getReceiptPayloadForCustomer(
  tenantId: string,
  invoiceId: string,
  profileId: string,
): Promise<ReceiptPayload | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: invoice } = await admin
    .from('invoices')
    .select('customer_profile_id')
    .eq('tenant_id', tenantId)
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice || invoice.customer_profile_id !== profileId) return null;
  return loadReceiptPayload(admin, tenantId, invoiceId);
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
        idempotency_key?: string | null;
        status?: string | null;
        amount_minor?: number | null;
        reason?: string | null;
      }
    | undefined,
): RefundOperationState | null {
  if (!refund?.idempotency_key || !isRefundOperationStatus(refund.status)) return null;
  return {
    operationId: refund.idempotency_key,
    status: refund.status,
    amountMinor: refund.amount_minor ?? 0,
    reason: refund.reason ?? null,
  };
}

function isRefundOperationStatus(
  status: string | null | undefined,
): status is RefundOperationState['status'] {
  return status === 'pending' || status === 'succeeded' || status === 'failed';
}

async function resolveCustomerProfileId(admin: Admin, companyId: string): Promise<string | null> {
  const { data } = await admin
    .from('customer_profiles')
    .select('profile_id')
    .eq('linked_company_id', companyId)
    .maybeSingle();
  return data?.profile_id ?? null;
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
  const { data: invoice } = await invoiceQuery.maybeSingle();
  if (!invoice) return null;
  if (!isReceiptEligible(invoice.status as string)) return null;

  const [{ data: tenant }, { data: company }, { data: payment }] = await Promise.all([
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

  const { data: refunds } = payment?.id
    ? await admin
        .from('refunds')
        .select('amount_minor, reason, status')
        .eq('tenant_id', tenantId)
        .eq('payment_id', payment.id as string)
        .order('created_at', { ascending: false })
    : { data: [] };

  let customerName: string | null = null;
  if (invoice.customer_profile_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', invoice.customer_profile_id as string)
      .maybeSingle();
    customerName = (profile?.full_name as string | null) ?? null;
  }

  return {
    tenantName: (tenant?.name as string | null) ?? 'Mandoob',
    tenantColor: (tenant?.primary_color as string | null) ?? null,
    companyName: (company?.company_name as string | null) ?? 'Unknown company',
    customerName,
    invoiceId: invoice.id as string,
    label: invoice.label as string,
    amount: formatMoney(invoice.amount_minor as number, invoice.currency as string),
    status: invoice.status as string,
    paidAt: (invoice.paid_at as string | null) ?? (payment?.received_at as string | null) ?? null,
    paymentMethod: (payment?.method as string | null) ?? null,
    paymentProvider: (payment?.provider as string | null) ?? null,
    refunds: (refunds ?? []).map((r) => ({
      amount: formatMoney(r.amount_minor as number, invoice.currency as string),
      reason: (r.reason as string | null) ?? null,
      status: r.status as string,
    })),
  };
}

function normaliseDueAt(dueAt: Date | string | null | undefined): string | null {
  if (!dueAt) return null;
  if (dueAt instanceof Date) return dueAt.toISOString().slice(0, 10);
  return dueAt;
}

async function fanOutInvoiceDueEmail(opts: {
  admin: Admin;
  invoiceId: string;
  tenantId: string;
  companyId: string;
  customerProfileId: string | null;
  label: string;
  amountMinor: bigint | number;
  currency: string;
}): Promise<number | null> {
  if (!opts.customerProfileId) return null;

  const [{ data: tenant }, { data: profile }, { data: authUser }] = await Promise.all([
    opts.admin.from('tenants').select('name').eq('id', opts.tenantId).maybeSingle(),
    opts.admin.from('profiles').select('full_name').eq('id', opts.customerProfileId).maybeSingle(),
    opts.admin.auth.admin.getUserById(opts.customerProfileId),
  ]);

  const email = authUser?.user?.email;
  if (!email) return null;

  const result = await enqueueEmail({
    tenantId: opts.tenantId,
    templateId: 'invoice-due',
    toAddress: email,
    input: {
      customerName: profile?.full_name ?? 'there',
      tenantName: tenant?.name ?? '',
      amount: formatMoney(opts.amountMinor, opts.currency),
      invoiceUrl: invoiceUrl(opts.invoiceId),
    },
    linked: { entityType: 'invoice', entityId: opts.invoiceId },
  });

  return result.ok ? result.queueId : null;
}

function invoiceUrl(invoiceId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base}/portal/payments?invoice=${invoiceId}`;
}
