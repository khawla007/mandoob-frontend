import { z } from 'zod';

const invoiceRowSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().nonnegative().safe(),
    tenant_id: z.string().uuid(),
    company_id: z.string().uuid(),
    customer_profile_id: z.string().uuid().nullable(),
    label: z.string().min(1),
    amount_minor: z.number().int().nonnegative().safe(),
    outstanding_minor: z.number().int().nonnegative().safe().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    status: z.string().min(1),
    due_at: z.string().nullable(),
    paid_at: z.string().nullable(),
    created_at: z.string().datetime({ offset: true }),
  })
  .passthrough();

const invoiceWindowSchema = z
  .object({
    rows: z.array(invoiceRowSchema),
    total: z.number().int().nonnegative().safe(),
  })
  .passthrough();

export function parseInvoiceRpcWindow(value: unknown) {
  const parsed = invoiceWindowSchema.safeParse(value);
  if (!parsed.success) throw new Error('INVOICE_SOURCE_UNAVAILABLE');
  return parsed.data;
}
