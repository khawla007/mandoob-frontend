import { z } from 'zod';
import {
  invoiceLineInputSchema,
  sanitizeFinanceError,
  type FinanceActionResult,
} from '@/lib/finance/contracts';
import type {
  InvoiceReceipt,
  PaymentReceipt,
  createInvoiceDraft,
  finalizeInvoice,
  allocateManualPayment,
  voidInvoice,
} from '@/lib/finance/repository';

type CreateInput = Parameters<typeof createInvoiceDraft>[1];
type InvoiceInput = Parameters<typeof finalizeInvoice>[1];
type AllocationInput = Parameters<typeof allocateManualPayment>[1];
type VoidInput = Parameters<typeof voidInvoice>[1];
type Authority = { tenantId: string; companyId: string; actorId: string; tenantSlug: string };

export type ProFinanceActionDependencies = {
  authorize(slug: string): Promise<Authority>;
  createDraft(input: CreateInput): Promise<FinanceActionResult<InvoiceReceipt>>;
  finalize(input: InvoiceInput): Promise<FinanceActionResult<InvoiceReceipt>>;
  allocate(input: AllocationInput): Promise<FinanceActionResult<PaymentReceipt>>;
  voidInvoice(input: VoidInput): Promise<FinanceActionResult<InvoiceReceipt>>;
  revalidate(path: string): void;
};

const uuid = z.string().uuid();
const meta = { operationId: uuid, expectedVersion: z.number().int().nonnegative() };
const reference = z.object({ tenantSlug: z.string().min(1), invoiceId: uuid, ...meta }).strict();
const createSchema = z
  .object({
    operationId: uuid,
    customerProfileId: uuid,
    label: z.string().trim().min(1).max(160),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    lines: z.array(invoiceLineInputSchema).min(1).max(500),
  })
  .strict();
const allocationSchema = reference
  .extend({
    amountMinor: z.number().int().positive().max(100_000_000_000),
    method: z.enum(['cash', 'bank_transfer']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
const voidSchema = reference.extend({ reason: z.string().trim().min(3).max(500) }).strict();

type SafeResult<T> = FinanceActionResult<T>;
function safeFailure<T>(error: unknown): SafeResult<T> {
  if (error instanceof z.ZodError) return { ok: false, code: 'VALIDATION_FAILED' };
  return sanitizeFinanceError(error);
}

function revalidateFinance(deps: ProFinanceActionDependencies, slug: string, invoiceId: string) {
  for (const path of [
    `/t/${slug}/payments`,
    `/t/${slug}/payments/${invoiceId}`,
    `/t/${slug}/payments/analytics`,
    `/t/${slug}/company`,
    `/t/${slug}/dashboard`,
    `/t/${slug}/finance`,
    `/t/${slug}/portal/payments`,
    `/t/${slug}/portal/payments/${invoiceId}`,
  ])
    deps.revalidate(path);
}

export async function runCreateInvoiceAction(
  slug: string,
  raw: unknown,
  deps: ProFinanceActionDependencies,
): Promise<SafeResult<InvoiceReceipt>> {
  try {
    const authority = await deps.authorize(slug);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED' };
    const result = await deps.createDraft({
      tenantId: authority.tenantId,
      companyId: authority.companyId,
      actorId: authority.actorId,
      expectedVersion: 0,
      ...parsed.data,
    });
    if (result.ok) revalidateFinance(deps, authority.tenantSlug, result.data.invoiceId);
    return result;
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runFinalizeInvoiceAction(
  raw: unknown,
  deps: ProFinanceActionDependencies,
): Promise<SafeResult<InvoiceReceipt>> {
  return runInvoiceCommand(raw, deps, (input) => deps.finalize(input));
}

export async function runManualPaymentAction(
  raw: unknown,
  deps: ProFinanceActionDependencies,
): Promise<SafeResult<PaymentReceipt>> {
  try {
    const parsed = allocationSchema.parse(raw);
    const authority = await deps.authorize(parsed.tenantSlug);
    const result = await deps.allocate({
      tenantId: authority.tenantId,
      companyId: authority.companyId,
      actorId: authority.actorId,
      invoiceId: parsed.invoiceId,
      operationId: parsed.operationId,
      expectedVersion: parsed.expectedVersion,
      amountMinor: parsed.amountMinor,
      method: parsed.method,
      note: parsed.note,
    });
    if (result.ok) revalidateFinance(deps, authority.tenantSlug, result.data.invoiceId);
    return result;
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runVoidInvoiceAction(
  raw: unknown,
  deps: ProFinanceActionDependencies,
): Promise<SafeResult<InvoiceReceipt>> {
  try {
    const parsed = voidSchema.parse(raw);
    const authority = await deps.authorize(parsed.tenantSlug);
    const result = await deps.voidInvoice({
      tenantId: authority.tenantId,
      companyId: authority.companyId,
      actorId: authority.actorId,
      invoiceId: parsed.invoiceId,
      operationId: parsed.operationId,
      expectedVersion: parsed.expectedVersion,
      reason: parsed.reason,
    });
    if (result.ok) revalidateFinance(deps, authority.tenantSlug, result.data.invoiceId);
    return result;
  } catch (error) {
    return safeFailure(error);
  }
}

async function runInvoiceCommand(
  raw: unknown,
  deps: ProFinanceActionDependencies,
  execute: (input: InvoiceInput) => Promise<SafeResult<InvoiceReceipt>>,
) {
  try {
    const parsed = reference.parse(raw);
    const authority = await deps.authorize(parsed.tenantSlug);
    const result = await execute({
      tenantId: authority.tenantId,
      companyId: authority.companyId,
      actorId: authority.actorId,
      invoiceId: parsed.invoiceId,
      operationId: parsed.operationId,
      expectedVersion: parsed.expectedVersion,
    });
    if (result.ok) revalidateFinance(deps, authority.tenantSlug, result.data.invoiceId);
    return result;
  } catch (error) {
    return safeFailure<InvoiceReceipt>(error);
  }
}
