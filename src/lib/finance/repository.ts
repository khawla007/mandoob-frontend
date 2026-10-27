import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FinanceActionErrorCode, FinanceActionResult, InvoiceLineInput } from './contracts';

export type FinanceRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

type Scope = { tenantId: string; companyId: string; actorId: string };
type CommandMeta = { operationId: string; expectedVersion: number };
type InvoiceRef = Scope & CommandMeta & { invoiceId: string };
export type InvoiceReceipt = { invoiceId: string; version: number; replayed: boolean };
export type PaymentReceipt = InvoiceReceipt & { paymentId: string };
export type RefundIntentReceipt = InvoiceReceipt & {
  refundId: string;
  paymentId: string;
  provider: string;
  providerChargeId: string | null;
  providerIdempotencyKey: string;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed';
};
export type RefundReceipt = InvoiceReceipt & {
  refundId: string;
  paymentId: string;
  partial: boolean;
  status: 'pending' | 'succeeded' | 'failed';
};

const uuid = z.string().uuid();
const version = z.number().int().nonnegative().safe();
const invoiceReceiptSchema = z
  .object({ invoiceId: uuid, version, replayed: z.boolean() })
  .passthrough();
const refundReceiptSchema = invoiceReceiptSchema.extend({
  refundId: uuid,
  paymentId: uuid,
  partial: z.boolean(),
  status: z.enum(['pending', 'succeeded', 'failed']),
});
const refundIntentSchema = invoiceReceiptSchema
  .extend({
    refundId: uuid,
    paymentId: uuid,
    provider: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/u),
    providerChargeId: z.string().trim().min(1).max(255).nullable(),
    providerIdempotencyKey: z.string().trim().min(1).max(255),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    status: z.enum(['pending', 'succeeded', 'failed']),
  })
  .superRefine((value, context) => {
    if (value.provider === 'tap' && !value.providerChargeId)
      context.addIssue({ code: 'custom', path: ['providerChargeId'], message: 'required' });
  });

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

export function financePayloadHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

export function financePhaseOperationId(operationId: string, phase: string): string {
  const hash = createHash('sha256').update(`p309:${operationId}:${phase}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function errorCode(error: unknown): FinanceActionErrorCode {
  const candidate =
    error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : {};
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  if (candidate.code === '40001' || message.includes('STALE_VERSION')) return 'STALE_VERSION';
  if (message.includes('OPERATION_REUSED')) return 'OPERATION_REUSED';
  if (message.includes('CURRENCY_MISMATCH')) return 'CURRENCY_MISMATCH';
  if (message.includes('OVERPAYMENT')) return 'OVERPAYMENT';
  if (message.includes('REFUND_EXCEEDS_CAPTURE')) return 'REFUND_EXCEEDS_CAPTURE';
  if (message.includes('CONFLICT')) return 'CONFLICT';
  if (message.includes('FORBIDDEN') || message.includes('DENIED')) return 'FORBIDDEN';
  if (message.includes('NOT_FOUND') || message.includes('not_found') || candidate.code === 'P0001')
    return 'NOT_FOUND';
  if (candidate.code === '23505') return 'OPERATION_REUSED';
  return 'UNAVAILABLE';
}

function rpcArgs(scope: Scope, meta: CommandMeta, payload: Record<string, unknown>) {
  return {
    p_tenant_id: scope.tenantId,
    p_company_id: scope.companyId,
    p_actor_id: scope.actorId,
    p_operation_id: meta.operationId,
    p_expected_version: meta.expectedVersion,
    p_payload_hash: financePayloadHash({
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      payload,
    }),
    ...payload,
  };
}

function asRecord(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function field<T>(row: Record<string, unknown>, camel: string, snake: string): T {
  return (row[camel] ?? row[snake]) as T;
}

async function command<T>(
  client: FinanceRpcClient,
  name: string,
  args: Record<string, unknown>,
  parse: (row: Record<string, unknown>) => T,
): Promise<FinanceActionResult<T>> {
  const { data, error } = await client.rpc(name, args);
  if (error) return { ok: false, code: errorCode(error) };
  const row = asRecord(data);
  if (!row) return { ok: false, code: 'UNAVAILABLE' };
  try {
    return { ok: true, data: parse(row) };
  } catch {
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

const invoiceReceipt = (row: Record<string, unknown>): InvoiceReceipt => ({
  invoiceId: requiredUuid(field(row, 'invoiceId', 'invoice_id')),
  version: requiredVersion(field(row, 'version', 'version')),
  replayed: requiredBoolean(field(row, 'replayed', 'replayed')),
});

function requiredUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
    throw new Error('INVALID_RECEIPT');
  return value;
}

function requiredVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('INVALID_RECEIPT');
  return value as number;
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('INVALID_RECEIPT');
  return value;
}

export async function createInvoiceDraft(
  client: FinanceRpcClient,
  input: Scope &
    CommandMeta & {
      customerProfileId: string | null;
      label: string;
      dueDate: string | null;
      lines: InvoiceLineInput[];
    },
): Promise<FinanceActionResult<InvoiceReceipt>> {
  const payload = {
    p_customer_profile_id: input.customerProfileId,
    p_label: input.label,
    p_due_date: input.dueDate,
    p_lines: input.lines,
  };
  return command(
    client,
    'p309_create_invoice_draft',
    rpcArgs(input, input, payload),
    invoiceReceipt,
  );
}

export async function finalizeInvoice(
  client: FinanceRpcClient,
  input: InvoiceRef,
): Promise<FinanceActionResult<InvoiceReceipt>> {
  const payload = { p_invoice_id: input.invoiceId };
  return command(client, 'p309_finalize_invoice', rpcArgs(input, input, payload), invoiceReceipt);
}

export async function allocateManualPayment(
  client: FinanceRpcClient,
  input: InvoiceRef & {
    amountMinor: number;
    method: 'cash' | 'bank_transfer';
    note?: string;
  },
): Promise<FinanceActionResult<PaymentReceipt>> {
  const payload = {
    p_invoice_id: input.invoiceId,
    p_amount_minor: input.amountMinor,
    p_method: input.method,
    p_note: input.note ?? null,
  };
  return command(client, 'p309_allocate_manual_payment', rpcArgs(input, input, payload), (row) => ({
    ...invoiceReceipt(row),
    paymentId: requiredUuid(field(row, 'paymentId', 'payment_id')),
  }));
}

export async function allocateReviewedBankPayment(
  client: FinanceRpcClient,
  input: InvoiceRef & { evidenceSubmissionId: string; amountMinor: number; note?: string },
): Promise<FinanceActionResult<PaymentReceipt>> {
  const payload = {
    p_invoice_id: input.invoiceId,
    p_submission_id: input.evidenceSubmissionId,
    p_amount_minor: input.amountMinor,
    p_note: input.note ?? null,
  };
  return command(
    client,
    'p309_allocate_reviewed_bank_payment',
    rpcArgs(input, input, payload),
    (row) => ({
      ...invoiceReceipt(row),
      paymentId: requiredUuid(field(row, 'paymentId', 'payment_id')),
    }),
  );
}

export async function voidInvoice(
  client: FinanceRpcClient,
  input: InvoiceRef & { reason: string },
): Promise<FinanceActionResult<InvoiceReceipt>> {
  const payload = { p_invoice_id: input.invoiceId, p_reason: input.reason };
  return command(client, 'p309_void_invoice', rpcArgs(input, input, payload), invoiceReceipt);
}

export async function prepareInvoiceRefund(
  client: FinanceRpcClient,
  input: InvoiceRef & {
    paymentId: string;
    amountMinor: number;
    reason: string;
  },
): Promise<FinanceActionResult<RefundIntentReceipt>> {
  const payload = {
    p_invoice_id: input.invoiceId,
    p_payment_id: input.paymentId,
    p_amount_minor: input.amountMinor,
    p_reason: input.reason,
  };
  return command(client, 'p309_prepare_refund', rpcArgs(input, input, payload), (row) => ({
    ...refundIntentSchema.parse(row),
  }));
}

export async function attachPendingInvoiceRefund(
  client: FinanceRpcClient,
  input: InvoiceRef & { paymentId: string; refundId: string; providerRefundId: string },
): Promise<FinanceActionResult<RefundReceipt>> {
  const payload = {
    p_invoice_id: input.invoiceId,
    p_payment_id: input.paymentId,
    p_refund_id: input.refundId,
    p_provider_refund_id: input.providerRefundId,
  };
  return command(client, 'p309_attach_pending_refund', rpcArgs(input, input, payload), (row) =>
    refundReceiptSchema.parse(row),
  );
}

export async function reconcileInvoiceRefund(
  client: FinanceRpcClient,
  input: InvoiceRef & {
    paymentId: string;
    refundId: string;
    providerRefundId: string | null;
    status: 'pending' | 'succeeded' | 'failed';
  },
): Promise<FinanceActionResult<RefundReceipt>> {
  const payload = {
    p_invoice_id: input.invoiceId,
    p_payment_id: input.paymentId,
    p_refund_id: input.refundId,
    p_provider_refund_id: input.providerRefundId,
    p_status: input.status,
  };
  return command(client, 'p309_reconcile_refund', rpcArgs(input, input, payload), (row) =>
    refundReceiptSchema.parse(row),
  );
}

export async function reconcilePendingInvoiceRefund(
  client: FinanceRpcClient,
  input: { refundId: string; providerRefundId: string; status: 'succeeded' | 'failed' },
): Promise<FinanceActionResult<RefundReceipt>> {
  return command(
    client,
    'p309_reconcile_pending_refund',
    {
      p_refund_id: input.refundId,
      p_provider_refund_id: input.providerRefundId,
      p_status: input.status,
    },
    (row) => refundReceiptSchema.parse(row),
  );
}

export async function reconcileClaimedInvoiceRefund(
  client: FinanceRpcClient,
  input: {
    refundId: string;
    providerRefundId: string | null;
    status: 'succeeded' | 'failed';
    workerId: string;
    leaseToken: string;
  },
): Promise<FinanceActionResult<RefundReceipt>> {
  return command(
    client,
    'p309_reconcile_claimed_refund',
    {
      p_refund_id: input.refundId,
      p_provider_refund_id: input.providerRefundId,
      p_status: input.status,
      p_worker_id: input.workerId,
      p_lease_token: input.leaseToken,
    },
    (row) => refundReceiptSchema.parse(row),
  );
}

export async function getInvoiceRefundResult(
  client: FinanceRpcClient,
  refundId: string,
): Promise<FinanceActionResult<RefundReceipt>> {
  try {
    const { data, error } = await client.rpc('p309_get_refund_result', {
      p_refund_id: refundId,
    });
    if (error || !data) return { ok: false, code: 'UNAVAILABLE' };
    return { ok: true, data: refundReceiptSchema.parse(data) };
  } catch {
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

export async function loadCustomerInvoiceForPayment(scope: {
  tenantId: string;
  companyId: string;
  customerProfileId: string;
  invoiceId: string;
}) {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const { data, error } = await createSupabaseServiceRoleClient().rpc(
    'p309_get_customer_invoice' as never,
    {
      p_tenant_id: scope.tenantId,
      p_company_id: scope.companyId,
      p_customer_profile_id: scope.customerProfileId,
      p_invoice_id: scope.invoiceId,
    } as never,
  );
  if (error) return { ok: false as const, code: errorCode(error) };
  return { ok: true as const, data: asRecord(data) };
}

export type ExpenseReceipt = {
  expenseId: string;
  version: number;
  state: 'draft' | 'approved' | 'posted' | 'reversed';
  journalId?: string;
  replayed: boolean;
};

export type CompensationReceipt = {
  compensationId: string;
  version: number;
  state: 'draft' | 'approved' | 'posted' | 'reversed';
  journalId?: string;
  replayed: boolean;
};

const documentState = z.enum(['draft', 'approved', 'posted', 'reversed']);

function documentReceipt(
  row: Record<string, unknown>,
  kind: 'expense' | 'compensation',
): ExpenseReceipt | CompensationReceipt {
  const common = {
    version: requiredVersion(field(row, 'version', 'version')),
    state: documentState.parse(field(row, 'state', 'state')),
    replayed: requiredBoolean(field(row, 'replayed', 'replayed')),
  };
  const journal = field<unknown>(row, 'journalId', 'journal_id');
  const journalId = journal == null ? undefined : requiredUuid(journal);
  return kind === 'expense'
    ? {
        expenseId: requiredUuid(field(row, 'expenseId', 'expense_id')),
        ...common,
        ...(journalId ? { journalId } : {}),
      }
    : {
        compensationId: requiredUuid(field(row, 'compensationId', 'compensation_id')),
        ...common,
        ...(journalId ? { journalId } : {}),
      };
}

export async function createExpenseDraft(
  client: FinanceRpcClient,
  input: Scope &
    CommandMeta & {
      sourceReference: string;
      description: string;
      amountMinor: number;
      currency: string;
    },
) {
  const payload = {
    p_source_reference: input.sourceReference,
    p_description: input.description,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
  };
  return command(
    client,
    'p309_create_expense_draft',
    rpcArgs(input, input, payload),
    (row) => documentReceipt(row, 'expense') as ExpenseReceipt,
  );
}

export async function approveExpense(
  client: FinanceRpcClient,
  input: Scope & CommandMeta & { expenseId: string },
) {
  const payload = { p_expense_id: input.expenseId };
  return command(
    client,
    'p309_approve_expense',
    rpcArgs(input, input, payload),
    (row) => documentReceipt(row, 'expense') as ExpenseReceipt,
  );
}

export async function postExpense(
  client: FinanceRpcClient,
  input: Scope &
    CommandMeta & { expenseId: string; settlementAccount: 'cash_clearing' | 'bank_clearing' },
) {
  const payload = { p_expense_id: input.expenseId, p_settlement_account: input.settlementAccount };
  return command(
    client,
    'p309_post_expense',
    rpcArgs(input, input, payload),
    (row) => documentReceipt(row, 'expense') as ExpenseReceipt,
  );
}

export async function reverseExpense(
  client: FinanceRpcClient,
  input: Scope & CommandMeta & { expenseId: string; reason: string },
) {
  const payload = { p_expense_id: input.expenseId, p_reason: input.reason };
  return command(
    client,
    'p309_reverse_expense',
    rpcArgs(input, input, payload),
    (row) => documentReceipt(row, 'expense') as ExpenseReceipt,
  );
}

export async function createCompensationDraft(
  client: FinanceRpcClient,
  input: Scope &
    CommandMeta & {
      proProfileId: string;
      sourceReference: string;
      amountMinor: number;
      currency: string;
    },
) {
  const payload = {
    p_pro_profile_id: input.proProfileId,
    p_source_reference: input.sourceReference,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
  };
  return command(
    client,
    'p309_create_compensation_draft',
    rpcArgs(input, input, payload),
    (row) => documentReceipt(row, 'compensation') as CompensationReceipt,
  );
}

export async function approveCompensation(
  client: FinanceRpcClient,
  input: Scope & CommandMeta & { compensationId: string },
) {
  const payload = { p_compensation_id: input.compensationId };
  return command(
    client,
    'p309_approve_compensation',
    rpcArgs(input, input, payload),
    (row) => documentReceipt(row, 'compensation') as CompensationReceipt,
  );
}

export async function postCompensation(
  client: FinanceRpcClient,
  input: Scope & CommandMeta & { compensationId: string },
) {
  const payload = { p_compensation_id: input.compensationId };
  return command(
    client,
    'p309_post_compensation',
    rpcArgs(input, input, payload),
    (row) => documentReceipt(row, 'compensation') as CompensationReceipt,
  );
}

export async function reverseCompensation(
  client: FinanceRpcClient,
  input: Scope & CommandMeta & { compensationId: string; reason: string },
) {
  const payload = { p_compensation_id: input.compensationId, p_reason: input.reason };
  return command(
    client,
    'p309_reverse_compensation',
    rpcArgs(input, input, payload),
    (row) => documentReceipt(row, 'compensation') as CompensationReceipt,
  );
}

const financeCostsSchema = z
  .object({
    rows: z.array(
      z
        .object({
          journalId: uuid,
          sourceKind: z.enum([
            'expense',
            'expense_reversal',
            'compensation',
            'compensation_reversal',
          ]),
          sourceId: uuid,
          amountMinor: z
            .number()
            .int()
            .safe()
            .refine((amount) => amount !== 0),
          currency: z.string().regex(/^[A-Z]{3}$/u),
          accountingAt: z.string().datetime({ offset: true }),
        })
        .strict(),
    ),
    total: z.number().int().nonnegative().safe(),
    limit: z.number().int().positive().max(100).safe(),
  })
  .strict();

export async function listCompanyFinanceCosts(
  client: FinanceRpcClient,
  input: Scope & {
    beforeAccountingAt?: string | null;
    beforeId?: string | null;
    limit: number;
  },
) {
  const { data, error } = await client.rpc('p309_list_company_finance_costs', {
    p_tenant_id: input.tenantId,
    p_company_id: input.companyId,
    p_actor_id: input.actorId,
    p_before_accounting_at: input.beforeAccountingAt ?? null,
    p_before_id: input.beforeId ?? null,
    p_limit: input.limit,
  });
  if (error) return { ok: false as const, code: errorCode(error) };
  const parsed = financeCostsSchema.safeParse(data);
  return parsed.success
    ? { ok: true as const, data: parsed.data }
    : { ok: false as const, code: 'UNAVAILABLE' as const };
}
