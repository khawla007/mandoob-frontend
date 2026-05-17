import { z } from 'zod';

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const amountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Amount must use at most two decimals')
  .transform((value, ctx) => {
    const [whole, fraction = ''] = value.split('.');
    const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Amount must be positive' });
      return z.NEVER;
    }
    return amountMinor;
  });

export const createInvoiceActionSchema = z
  .object({
    clientId: z.string().uuid(),
    label: z.string().trim().min(1).max(160),
    amount: amountSchema,
    dueAt: isoDateSchema,
  })
  .transform((v) => ({
    clientId: v.clientId,
    label: v.label,
    amountMinor: v.amount,
    currency: 'AED' as const,
    dueAt: v.dueAt ?? null,
  }));
export type CreateInvoiceActionInput = z.infer<typeof createInvoiceActionSchema>;

export const manualPaymentActionSchema = z.object({
  invoiceId: z.string().uuid(),
  method: z.enum(['cash', 'bank_transfer']),
  note: z.string().trim().max(500).optional(),
});
export type ManualPaymentActionInput = z.infer<typeof manualPaymentActionSchema>;

export const voidInvoiceActionSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type VoidInvoiceActionInput = z.infer<typeof voidInvoiceActionSchema>;

export const refundInvoiceActionSchema = z.object({
  invoiceId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
export type RefundInvoiceActionInput = z.infer<typeof refundInvoiceActionSchema>;
