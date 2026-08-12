import 'server-only';
import { enqueueEmail } from '@/lib/mail/send';
import { formatMoney } from '@/lib/format/money';
import { isReceiptEligible } from '@/lib/pdf/receipt';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { signalBusinessDate } from './signal-finance';
import type { PaymentSignalView } from '@/lib/signal-studio-filters';

export type LinkedEntity = {
  type: 'renewal' | 'document_request' | 'manual';
  id: string;
};

export type CreateInvoiceArgs = {
  tenantId: string;
  clientId: string;
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
  clientId: string;
  clientName: string;
  customerProfileId: string | null;
  label: string;
  amount: string;
  amountMinor: number;
  currency: string;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
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
  client_id: string;
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
          'id, tenant_id, client_id, customer_profile_id, label, amount_minor, currency, status, due_at, paid_at, created_at',
          { count: 'exact' },
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
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
    const { data, error } = await admin.rpc('list_signal_payment_invoices', {
      p_tenant_id: tenantId,
      p_view: options.view,
      p_page: requestedPage,
      p_page_size: PAYMENT_INVOICE_PAGE_SIZE,
      p_today: options.today ?? signalBusinessDate(),
      p_date: options.date ?? null,
      p_period: options.period ?? null,
    });
    if (error) throw new Error(error.message);
    result = data as unknown as PaymentRpcResult;
  }
  const selected = result.rows;
  const clientNames = await getClientNames(
    admin,
    Array.from(new Set(selected.map((row) => row.client_id))),
  );
  return {
    rows: selected.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      clientName: clientNames.get(row.client_id) ?? 'Unknown client',
      customerProfileId: row.customer_profile_id ?? null,
      label: row.label,
      amount: formatMoney(row.amount_minor, row.currency),
      amountMinor: row.amount_minor,
      currency: row.currency,
      status: row.status,
      dueAt: row.due_at ?? null,
      paidAt: row.paid_at ?? null,
      createdAt: row.created_at,
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
  clientName: string;
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
    failureReason: string | null;
  }[];
  refunds: {
    id: string;
    amount: string;
    reason: string | null;
    status: string;
    createdAt: string;
  }[];
  audit: { id: string; action: string; createdAt: string; details: unknown }[];
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
    args.customerProfileId ?? (await resolveCustomerProfileId(admin, args.clientId));

  const dueAtIso = normaliseDueAt(args.dueAt);
  const insertPayload = {
    tenant_id: args.tenantId,
    client_id: args.clientId,
    customer_profile_id: customerProfileId,
    linked_entity_type: args.linked?.type ?? 'manual',
    linked_entity_id: args.linked?.id ?? null,
    label: args.label,
    amount_minor: Number(args.amountMinor),
    currency,
    status: 'open' as const,
    due_at: dueAtIso,
    created_by: args.createdBy ?? null,
  };

  const { data: inserted, error } = await admin
    .from('invoices')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? 'insert failed', code: 'DB_INSERT_FAILED' };
  }

  await admin.from('tenant_audit_log').insert({
    tenant_id: args.tenantId,
    actor_id: args.createdBy ?? null,
    action: 'invoice_created',
    source: args.createdBy ? 'admin' : 'system',
    details: {
      entity: 'invoice',
      invoice_id: inserted.id,
      client_id: args.clientId,
      amount_minor: Number(args.amountMinor),
      currency,
      linked_entity_type: insertPayload.linked_entity_type,
      linked_entity_id: insertPayload.linked_entity_id,
    },
  });

  const emailQueueId = await fanOutInvoiceDueEmail({
    admin,
    invoiceId: inserted.id,
    tenantId: args.tenantId,
    clientId: args.clientId,
    customerProfileId,
    label: args.label,
    amountMinor: args.amountMinor,
    currency,
  });

  return { ok: true, data: { id: inserted.id, emailQueueId } };
}

export async function listInvoicesForTenant(
  tenantId: string,
  opts: { clientId?: string; limit?: number } = {},
): Promise<ProInvoiceRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('invoices')
    .select(
      'id, client_id, customer_profile_id, label, amount_minor, currency, status, due_at, paid_at, created_at',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.clientId) query = query.eq('client_id', opts.clientId);

  const { data } = await query;
  const rows = data ?? [];
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id as string)));
  const clientNames = await getClientNames(admin, clientIds);

  return rows.map((r) => ({
    id: r.id as string,
    clientId: r.client_id as string,
    clientName: clientNames.get(r.client_id as string) ?? 'Unknown client',
    customerProfileId: (r.customer_profile_id as string | null) ?? null,
    label: r.label as string,
    amount: formatMoney(r.amount_minor as number, r.currency as string),
    amountMinor: r.amount_minor as number,
    currency: r.currency as string,
    status: r.status as string,
    dueAt: (r.due_at as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    createdAt: r.created_at as string,
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
  invoiceId: string,
): Promise<ReceiptPayload | null> {
  const admin = createSupabaseServiceRoleClient();
  const payload = await loadReceiptPayload(admin, tenantId, invoiceId);
  return payload;
}

export async function getInvoiceDetailForTenant(
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: invoice } = await admin
    .from('invoices')
    .select(
      'id, client_id, customer_profile_id, linked_entity_type, linked_entity_id, label, amount_minor, currency, status, due_at, paid_at, created_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return null;

  const [clientNames, paymentsResult, auditResult] = await Promise.all([
    getClientNames(admin, [invoice.client_id as string]),
    admin
      .from('payments')
      .select('id, provider, method, status, amount_minor, currency, received_at, failure_reason')
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

  const paymentIds = (paymentsResult.data ?? []).map((p) => p.id as string);
  const { data: refunds } = paymentIds.length
    ? await admin
        .from('refunds')
        .select('id, payment_id, amount_minor, reason, status, created_at')
        .in('payment_id', paymentIds)
        .order('created_at', { ascending: false })
    : { data: [] };

  return {
    id: invoice.id as string,
    clientId: invoice.client_id as string,
    clientName: clientNames.get(invoice.client_id as string) ?? 'Unknown client',
    customerProfileId: (invoice.customer_profile_id as string | null) ?? null,
    label: invoice.label as string,
    amount: formatMoney(invoice.amount_minor as number, invoice.currency as string),
    amountMinor: invoice.amount_minor as number,
    currency: invoice.currency as string,
    status: invoice.status as string,
    dueAt: (invoice.due_at as string | null) ?? null,
    paidAt: (invoice.paid_at as string | null) ?? null,
    createdAt: invoice.created_at as string,
    linkedEntityType: (invoice.linked_entity_type as string | null) ?? null,
    linkedEntityId: (invoice.linked_entity_id as string | null) ?? null,
    payments: (paymentsResult.data ?? []).map((p) => ({
      id: p.id as string,
      provider: p.provider as string,
      method: (p.method as string | null) ?? null,
      status: p.status as string,
      amount: formatMoney(p.amount_minor as number, p.currency as string),
      receivedAt: (p.received_at as string | null) ?? null,
      failureReason: (p.failure_reason as string | null) ?? null,
    })),
    refunds: (refunds ?? []).map((r) => ({
      id: r.id as string,
      amount: formatMoney(r.amount_minor as number, invoice.currency as string),
      reason: (r.reason as string | null) ?? null,
      status: r.status as string,
      createdAt: r.created_at as string,
    })),
    audit: (auditResult.data ?? []).map((a) => ({
      id: String(a.id),
      action: a.action as string,
      createdAt: a.created_at as string,
      details: a.details,
    })),
  };
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

async function resolveCustomerProfileId(admin: Admin, clientId: string): Promise<string | null> {
  const { data } = await admin
    .from('customer_profiles')
    .select('profile_id')
    .eq('linked_client_id', clientId)
    .maybeSingle();
  return data?.profile_id ?? null;
}

async function getClientNames(admin: Admin, clientIds: string[]): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map();
  const { data } = await admin.from('clients').select('id, company_name').in('id', clientIds);
  return new Map((data ?? []).map((r) => [r.id as string, r.company_name as string]));
}

async function loadReceiptPayload(
  admin: Admin,
  tenantId: string,
  invoiceId: string,
): Promise<ReceiptPayload | null> {
  const { data: invoice } = await admin
    .from('invoices')
    .select('id, client_id, customer_profile_id, label, amount_minor, currency, status, paid_at')
    .eq('tenant_id', tenantId)
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return null;
  if (!isReceiptEligible(invoice.status as string)) return null;

  const [{ data: tenant }, { data: client }, { data: payment }] = await Promise.all([
    admin.from('tenants').select('name, primary_color').eq('id', tenantId).maybeSingle(),
    admin
      .from('clients')
      .select('company_name')
      .eq('id', invoice.client_id as string)
      .maybeSingle(),
    admin
      .from('payments')
      .select('id, provider, method, status, received_at')
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
    clientName: (client?.company_name as string | null) ?? 'Unknown client',
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
  clientId: string;
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
