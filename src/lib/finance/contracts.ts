import { z } from 'zod';
import { calendarDateSchema } from '@/lib/validation/calendar-date';
import { calculateInvoiceLineAmounts, isIsoCurrency, type Money, type TaxBasis } from './money';

export const FINANCE_ACTION_ERROR_CODES = [
  'VALIDATION_FAILED',
  'FORBIDDEN',
  'NOT_FOUND',
  'STALE_VERSION',
  'OPERATION_REUSED',
  'CURRENCY_MISMATCH',
  'OVERPAYMENT',
  'REFUND_EXCEEDS_CAPTURE',
  'PROVIDER_DISABLED',
  'PROVIDER_PENDING',
  'CONFLICT',
  'UNAVAILABLE',
] as const;

export type FinanceActionErrorCode = (typeof FINANCE_ACTION_ERROR_CODES)[number];
export type FinanceActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: FinanceActionErrorCode };

const uuidSchema = z.string().uuid();
const safeIntegerSchema = z.number().int().safe();
const persistedAmountMinorSchema = safeIntegerSchema.min(-100_000_000_000).max(100_000_000_000);
const nonNegativeMinorSchema = persistedAmountMinorSchema.min(0);
const positiveLineMinorSchema = persistedAmountMinorSchema.min(1);
const currencySchema = z.string().refine(isIsoCurrency, 'unsupported ISO-4217 currency');
const timestampSchema = z.string().datetime({ offset: true });

// Generic arithmetic may use the full JavaScript safe-integer range.
export const moneySchema: z.ZodType<Money> = z
  .object({
    amountMinor: safeIntegerSchema,
    currency: currencySchema,
  })
  .strict();

// Database-backed amounts use the P3.09 per-value minor-unit limit.
export const persistedMoneySchema: z.ZodType<Money> = z
  .object({
    amountMinor: persistedAmountMinorSchema,
    currency: currencySchema,
  })
  .strict();

export const financeCommandMetaSchema = z
  .object({
    actorId: uuidSchema,
    operationId: uuidSchema,
    expectedVersion: safeIntegerSchema.min(0),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type FinanceCommandMeta = z.infer<typeof financeCommandMetaSchema>;

export const taxCategorySchema = z.enum(['standard', 'exempt', 'zero_rated']);
export const taxBasisSchema = z.enum(['exclusive', 'inclusive', 'exempt', 'zero_rated']);

export const invoiceLineInputSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    quantity: safeIntegerSchema.min(1).max(1_000_000),
    unitAmountMinor: nonNegativeMinorSchema.max(100_000_000_000),
    discountMinor: nonNegativeMinorSchema.max(100_000_000_000),
    taxCategory: taxCategorySchema,
    taxBasis: taxBasisSchema,
    vatBasisPoints: safeIntegerSchema.min(0).max(10_000),
    currency: currencySchema,
  })
  .strict()
  .superRefine((line, context) => {
    const validTaxProvenance =
      (line.taxCategory === 'standard' &&
        (line.taxBasis === 'exclusive' || line.taxBasis === 'inclusive') &&
        line.vatBasisPoints === 500) ||
      (line.taxCategory === 'exempt' && line.taxBasis === 'exempt' && line.vatBasisPoints === 0) ||
      (line.taxCategory === 'zero_rated' &&
        line.taxBasis === 'zero_rated' &&
        line.vatBasisPoints === 0);
    if (!validTaxProvenance) {
      context.addIssue({ code: 'custom', path: ['taxBasis'], message: 'invalid tax provenance' });
    }

    const base = BigInt(line.quantity) * BigInt(line.unitAmountMinor);
    if (BigInt(line.discountMinor) > base) {
      context.addIssue({
        code: 'custom',
        path: ['discountMinor'],
        message: 'discount exceeds line base',
      });
    }
    if (base - BigInt(line.discountMinor) > BigInt(100_000_000_000)) {
      context.addIssue({ code: 'custom', path: ['quantity'], message: 'line amount is too large' });
    }
    if (validTaxProvenance) {
      try {
        calculateInvoiceLineAmounts(line);
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['unitAmountMinor'],
          message: 'calculated line amounts are out of range',
        });
      }
    }
  });

export type InvoiceLineInput = z.infer<typeof invoiceLineInputSchema>;

export const invoiceStatusSchema = z.enum([
  'draft',
  'open',
  'paid',
  'void',
  'refunded',
  'partially_refunded',
]);

export const MAX_INVOICE_LINES = 500;

export const invoiceSnapshotSchema = z
  .object({
    invoiceId: uuidSchema,
    tenantId: uuidSchema,
    companyId: uuidSchema,
    customerProfileId: uuidSchema.nullable(),
    version: safeIntegerSchema.min(0),
    status: invoiceStatusSchema,
    currency: currencySchema,
    subtotalMinor: nonNegativeMinorSchema,
    vatMinor: nonNegativeMinorSchema,
    totalMinor: nonNegativeMinorSchema,
    allocatedMinor: nonNegativeMinorSchema,
    creditedMinor: nonNegativeMinorSchema,
    outstandingMinor: nonNegativeMinorSchema,
    refundedMinor: nonNegativeMinorSchema,
    dueDate: calendarDateSchema.nullable(),
    finalizedAt: timestampSchema.nullable(),
    voidedAt: timestampSchema.nullable(),
    lines: z.array(invoiceLineInputSchema).max(MAX_INVOICE_LINES),
  })
  .strict()
  .superRefine((invoice, context) => {
    if (invoice.lines.some((line) => line.currency !== invoice.currency)) {
      context.addIssue({ code: 'custom', path: ['lines'], message: 'currency mismatch' });
    }

    const isDraft = invoice.status === 'draft';
    const isVoid = invoice.status === 'void';
    if (
      (isDraft && (invoice.finalizedAt !== null || invoice.voidedAt !== null)) ||
      (!isDraft && invoice.finalizedAt === null) ||
      (isVoid && invoice.voidedAt === null) ||
      (!isVoid && invoice.voidedAt !== null)
    ) {
      context.addIssue({ code: 'custom', path: ['status'], message: 'invalid invoice lifecycle' });
    }
    if (
      invoice.finalizedAt !== null &&
      invoice.voidedAt !== null &&
      Date.parse(invoice.voidedAt) < Date.parse(invoice.finalizedAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['voidedAt'],
        message: 'void timestamp precedes finalization',
      });
    }

    const subtotal = BigInt(invoice.subtotalMinor);
    const vat = BigInt(invoice.vatMinor);
    const total = BigInt(invoice.totalMinor);
    const allocated = BigInt(invoice.allocatedMinor);
    const credited = BigInt(invoice.creditedMinor);
    const outstanding = BigInt(invoice.outstandingMinor);
    const refunded = BigInt(invoice.refundedMinor);
    let derivedSubtotal = BigInt(0);
    let derivedVat = BigInt(0);
    let derivedTotal = BigInt(0);
    for (const line of invoice.lines) {
      let amounts: ReturnType<typeof calculateInvoiceLineAmounts>;
      try {
        amounts = calculateInvoiceLineAmounts(line);
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['lines'],
          message: 'line amounts cannot be derived',
        });
        return;
      }
      derivedSubtotal += BigInt(amounts.netMinor);
      derivedVat += BigInt(amounts.vatMinor);
      derivedTotal += BigInt(amounts.totalMinor);
    }
    if (subtotal !== derivedSubtotal) {
      context.addIssue({
        code: 'custom',
        path: ['subtotalMinor'],
        message: 'subtotal does not match lines',
      });
    }
    if (vat !== derivedVat) {
      context.addIssue({ code: 'custom', path: ['vatMinor'], message: 'VAT does not match lines' });
    }
    if (total !== derivedTotal) {
      context.addIssue({
        code: 'custom',
        path: ['totalMinor'],
        message: 'total does not match lines',
      });
    }
    if (subtotal + vat !== total) {
      context.addIssue({ code: 'custom', path: ['totalMinor'], message: 'invalid invoice total' });
    }
    if (refunded > allocated) {
      context.addIssue({
        code: 'custom',
        path: ['refundedMinor'],
        message: 'refund exceeds allocations',
      });
    }

    const applied = allocated + credited;
    if (invoice.status !== 'void' && applied > total) {
      context.addIssue({ code: 'custom', path: ['creditedMinor'], message: 'invoice overapplied' });
    } else if (invoice.status !== 'void' && total - applied !== outstanding) {
      context.addIssue({
        code: 'custom',
        path: ['outstandingMinor'],
        message: 'invalid outstanding amount',
      });
    }

    const statusBalanceValid = (() => {
      switch (invoice.status) {
        case 'draft':
          return allocated === BigInt(0) && credited === BigInt(0) && refunded === BigInt(0);
        case 'open':
          return outstanding > BigInt(0);
        case 'paid':
          return outstanding === BigInt(0) && refunded === BigInt(0);
        case 'partially_refunded':
          return outstanding === BigInt(0) && refunded > BigInt(0) && refunded < allocated;
        case 'refunded':
          return outstanding === BigInt(0) && allocated > BigInt(0) && refunded === allocated;
        case 'void':
          return (
            outstanding === BigInt(0) &&
            allocated === BigInt(0) &&
            credited === BigInt(0) &&
            refunded === BigInt(0)
          );
      }
    })();
    if (!statusBalanceValid) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'status does not match invoice balances',
      });
    }
  });

export type InvoiceSnapshot = z.infer<typeof invoiceSnapshotSchema>;

export const paymentAllocationSchema = z
  .object({
    allocationId: uuidSchema,
    invoiceId: uuidSchema,
    paymentId: uuidSchema,
    amountMinor: positiveLineMinorSchema,
    currency: currencySchema,
    allocatedAt: timestampSchema,
  })
  .strict();

export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>;

export function paymentAllocationForCurrencySchema(currency: string) {
  if (!isIsoCurrency(currency)) throw new Error('CURRENCY_INVALID');
  return paymentAllocationSchema.refine((allocation) => allocation.currency === currency, {
    path: ['currency'],
    message: 'currency mismatch',
  });
}

export const refundReceiptSchema = z
  .object({
    refundId: uuidSchema,
    paymentId: uuidSchema,
    invoiceId: uuidSchema,
    amountMinor: positiveLineMinorSchema,
    currency: currencySchema,
    status: z.enum(['pending', 'succeeded', 'failed']),
    createdAt: timestampSchema,
  })
  .strict();

export type RefundReceipt = z.infer<typeof refundReceiptSchema>;

export function refundReceiptForCurrencySchema(currency: string) {
  if (!isIsoCurrency(currency)) throw new Error('CURRENCY_INVALID');
  return refundReceiptSchema.refine((refund) => refund.currency === currency, {
    path: ['currency'],
    message: 'currency mismatch',
  });
}

export const financeActionErrorCodeSchema = z.enum(FINANCE_ACTION_ERROR_CODES);

export function financeActionResultSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: dataSchema }).strict(),
    z.object({ ok: z.literal(false), code: financeActionErrorCodeSchema }).strict(),
  ]);
}

export function sanitizeFinanceError(error: unknown): FinanceActionResult<never> {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const parsed = financeActionErrorCodeSchema.safeParse((error as { code?: unknown }).code);
    if (parsed.success) return { ok: false, code: parsed.data };
  }
  return { ok: false, code: 'UNAVAILABLE' };
}

export type { Money, TaxBasis };
