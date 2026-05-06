import { z } from 'zod';

export const CLIENT_STATUSES = [
  'onboarding',
  'active',
  'renewal_due',
  'renewal_overdue',
  'suspended',
  'churned',
] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const createClientSchema = z.object({
  company_name: z.string().trim().min(2, 'Company name is required').max(200),
  trade_license_no: z.string().trim().max(64).optional().or(z.literal('')),
  jurisdiction: z.string().trim().max(120).optional().or(z.literal('')),
  license_expiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = z.object({
  company_name: z.string().trim().min(2, 'Company name is required').max(200),
  trade_license_no: z.string().trim().max(64).optional().or(z.literal('')),
  jurisdiction: z.string().trim().max(120).optional().or(z.literal('')),
  license_expiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
});
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
