import { z } from 'zod';

export const RENEWAL_TYPES = [
  'license',
  'visa',
  'investor_visa',
  'eid',
  'establishment_card',
  'ejari',
  'medical_insurance',
] as const;
export const renewalTypeSchema = z.enum(RENEWAL_TYPES);
export type RenewalTypeInput = z.infer<typeof renewalTypeSchema>;

export const RENEWAL_STAGES = [
  'due',
  'in_progress',
  'documents_submitted',
  'government_processing',
  'completed',
  'cancelled',
] as const;
export const renewalStageSchema = z.enum(RENEWAL_STAGES);
export type RenewalStage = z.infer<typeof renewalStageSchema>;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const minorUnits = z.number().int().min(0).max(100_000_000_000);
const currency = z.string().regex(/^[A-Z]{3}$/u);
const reasonCode = z.string().regex(/^[a-z][a-z0-9_]{2,63}$/u);
const operationId = z.string().uuid();
const expectedVersion = z.number().int().min(1);

export const renewalCostsSchema = z
  .object({
    government_fee_minor: minorUnits.optional(),
    pro_service_fee_minor: minorUnits.optional(),
    fine_minor: minorUnits.optional(),
    currency: currency.optional(),
  })
  .strict();

export const createRenewalSchema = z.object({
  company_id: z.string().uuid(),
  type: renewalTypeSchema,
  label: z.string().trim().min(1).max(140),
  due_date: isoDateSchema,
  employee_id: z.string().uuid().optional(),
  government_fee_minor: minorUnits.optional(),
  pro_service_fee_minor: minorUnits.optional(),
  fine_minor: minorUnits.optional(),
  currency: currency.optional(),
});
export type CreateRenewalInput = z.infer<typeof createRenewalSchema>;
export const createRenewalActionSchema = createRenewalSchema
  .omit({ company_id: true })
  .extend({ operation_id: operationId });
export type CreateRenewalActionInput = z.infer<typeof createRenewalActionSchema>;

export const updateRenewalSchema = z
  .object({
    operation_id: operationId,
    expected_version: expectedVersion,
    label: z.string().trim().min(1).max(140).optional(),
    due_date: isoDateSchema.optional(),
    costs: renewalCostsSchema.optional(),
    blocker_code: reasonCode.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.label !== undefined ||
      value.due_date !== undefined ||
      value.costs !== undefined ||
      value.blocker_code !== undefined,
    { message: 'no fields to update' },
  );
export type UpdateRenewalInput = z.infer<typeof updateRenewalSchema>;

export const transitionRenewalSchema = z
  .object({
    operation_id: operationId,
    expected_version: expectedVersion,
    to_stage: renewalStageSchema.exclude(['due']),
    evidence_document_ids: z.array(z.string().uuid()).max(20).optional(),
    reason_code: reasonCode.optional(),
  })
  .strict();
export type TransitionRenewalInput = z.infer<typeof transitionRenewalSchema>;

export const batchTransitionRenewalSchema = z
  .object({
    operation_id: operationId,
    to_stage: z.enum(['in_progress', 'government_processing', 'cancelled']),
    reason_code: reasonCode.optional(),
    items: z
      .array(
        z.object({ renewal_id: z.string().uuid(), expected_version: expectedVersion }).strict(),
      )
      .min(1)
      .max(100)
      .refine((items) => new Set(items.map((item) => item.renewal_id)).size === items.length, {
        message: 'duplicate renewal',
      }),
  })
  .strict();
export type BatchTransitionRenewalInput = z.infer<typeof batchTransitionRenewalSchema>;
