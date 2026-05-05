import { z } from 'zod';

export const renewalTypeSchema = z.enum(['license', 'visa', 'eid', 'ejari']);
export type RenewalTypeInput = z.infer<typeof renewalTypeSchema>;

export const renewalStatusSchema = z.enum([
  'upcoming',
  'due_soon',
  'overdue',
  'completed',
  'cancelled',
]);
export type RenewalStatusInput = z.infer<typeof renewalStatusSchema>;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const createRenewalSchema = z.object({
  client_id: z.string().uuid(),
  type: renewalTypeSchema,
  label: z.string().min(1).max(140),
  due_date: isoDateSchema,
});
export type CreateRenewalInput = z.infer<typeof createRenewalSchema>;

export const updateRenewalSchema = z
  .object({
    label: z.string().min(1).max(140).optional(),
    due_date: isoDateSchema.optional(),
    status: renewalStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });
export type UpdateRenewalInput = z.infer<typeof updateRenewalSchema>;
