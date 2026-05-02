import { z } from 'zod';
import { emailSchema, phoneSchema } from '@/lib/validation/auth';

export const TENANT_PLANS = ['starter', 'professional', 'enterprise'] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

export const TENANT_STATUSES = ['active', 'pending', 'suspended'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const tenantSlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(SLUG_REGEX, 'Slug must be lowercase letters, digits, hyphens (3-40 chars)');

export const provisionTenantSchema = z.object({
  name: z.string().min(3).max(200),
  slug: tenantSlugSchema,
  plan: z.enum(TENANT_PLANS),
  status: z.enum(TENANT_STATUSES),
  source: z.enum(['admin', 'self_serve']),
  admin_email: emailSchema,
  admin_full_name: z.string().min(1).max(200),
  admin_phone: phoneSchema,
});

export type ProvisionTenantInput = z.infer<typeof provisionTenantSchema>;
