import { z } from 'zod';
import type { EstimateInput } from './calculate';

const addOnSchema = z.enum(['bank_account', 'tax_registration', 'document_attestation']);

export const estimateInputSchema = z.object({
  jurisdiction: z.enum(['mainland', 'free_zone', 'offshore']),
  authority: z.string().trim().min(1).max(120),
  emirate: z.string().trim().min(1).max(80).nullable().optional(),
  activityKey: z.string().trim().min(1).max(80),
  shareholderCount: z.number().int().min(1).max(50),
  visaCount: z.number().int().min(0).max(200),
  legalStructure: z.enum(['llc', 'fz_llc', 'branch', 'offshore_company']),
  officeType: z.enum(['none', 'flexi']),
  addOns: z.array(addOnSchema).max(3).default([]),
}) satisfies z.ZodType<EstimateInput>;
