import { z } from 'zod';
import {
  REGISTRATION_STAGE_CODES,
  VISA_MILESTONE_CODES,
  type RegistrationBlockerCategory,
} from '@/lib/registration/contracts';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------
const uuid = z.string().uuid();
const operationId = uuid;
// Optimistic-concurrency versions are non-negative bigints on the wire; the
// server derives them from a prior read and the callers pass them straight
// through, so a safe-integer non-negative int is the accepted contract.
const expectedVersion = z.number().int().nonnegative();

// Reason text mirrors the DB CHECK (btrim, 3..500 chars, counted by code point).
const reasonText = z
  .string()
  .trim()
  .refine((value) => Array.from(value).length >= 3, {
    message: 'Reason must contain at least 3 characters',
  })
  .refine((value) => Array.from(value).length <= 500, {
    message: 'Reason must contain at most 500 characters',
  });

// Reason codes accepted by the stage / visa command RPCs. Each maps onto an
// allowlisted RegistrationBlockerCategory so no free-form category leaks to the
// presentation layer.
export const STAGE_REASON_CODES = [
  'AUTHORITY_DELAY',
  'CUSTOMER_ACTION_REQUIRED',
  'DOCUMENT_CORRECTION_REQUIRED',
  'BANK_REVIEW',
  'AUTHORITY_RESUMED',
  'CUSTOMER_ACTION_COMPLETED',
  'DOCUMENT_CORRECTED',
  'BANK_REVIEW_RESUMED',
  'NOT_APPLICABLE',
  'CUSTOMER_DECLINED',
  'OPERATOR_RECOVERY',
] as const;

export const VISA_TRANSITION_REASON_CODES = [
  'AUTHORITY_DELAY',
  'CUSTOMER_ACTION_REQUIRED',
  'DOCUMENT_CORRECTION_REQUIRED',
  'AUTHORITY_RESUMED',
  'CUSTOMER_ACTION_COMPLETED',
  'DOCUMENT_CORRECTED',
] as const;

export const VISA_CANCEL_REASON_CODES = [
  'CUSTOMER_CANCELLED',
  'NOT_APPLICABLE',
  'DUPLICATE_PERSON',
  'OPERATOR_CANCELLED',
] as const;

export type StageReasonCode = (typeof STAGE_REASON_CODES)[number];
export type VisaTransitionReasonCode = (typeof VISA_TRANSITION_REASON_CODES)[number];
export type VisaCancelReasonCode = (typeof VISA_CANCEL_REASON_CODES)[number];

// Every accepted reason code resolves to exactly one allowlisted blocker
// category. Exhaustively keyed so a new reason code fails to type-check until it
// is classified. Used by the presentation mapper, not by the RPC wrapper.
export const REASON_CODE_CATEGORY: Record<StageReasonCode, RegistrationBlockerCategory> = {
  AUTHORITY_DELAY: 'authority_review',
  AUTHORITY_RESUMED: 'authority_review',
  CUSTOMER_ACTION_REQUIRED: 'customer_document',
  CUSTOMER_ACTION_COMPLETED: 'customer_document',
  CUSTOMER_DECLINED: 'customer_document',
  DOCUMENT_CORRECTION_REQUIRED: 'identity_document',
  DOCUMENT_CORRECTED: 'identity_document',
  BANK_REVIEW: 'payment_prerequisite',
  BANK_REVIEW_RESUMED: 'payment_prerequisite',
  NOT_APPLICABLE: 'safe_other',
  OPERATOR_RECOVERY: 'safe_other',
};

// ---------------------------------------------------------------------------
// create_company_registration
// ---------------------------------------------------------------------------
export const createRegistrationSchema = z
  .object({
    companyId: uuid,
    title: z
      .string()
      .trim()
      .refine((value) => Array.from(value).length >= 2, {
        message: 'Title must contain at least 2 characters',
      })
      .refine((value) => Array.from(value).length <= 160, {
        message: 'Title must contain at most 160 characters',
      }),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    dueAt: z.string().datetime({ offset: true }).nullable(),
    operationId,
  })
  .strict();

// ---------------------------------------------------------------------------
// transition_registration_stage
// ---------------------------------------------------------------------------
export const transitionStageSchema = z
  .object({
    registrationId: uuid,
    stageId: uuid,
    command: z.enum(['start', 'block', 'unblock', 'complete', 'skip', 'recover']),
    expectedRegistrationVersion: expectedVersion,
    expectedStageVersion: expectedVersion,
    // details is an opaque object validated authoritatively by the RPC per
    // stage; the wrapper only guarantees it is a JSON object (never an array).
    details: z.record(z.string(), z.unknown()).default({}),
    reasonCode: z.enum(STAGE_REASON_CODES).nullable().default(null),
    reasonText: reasonText.nullable().default(null),
    operationId,
  })
  .strict()
  .superRefine((value, context) => {
    const requiresReason = ['block', 'unblock', 'skip', 'recover'].includes(value.command);
    const hasReason = value.reasonCode !== null || value.reasonText !== null;
    if (requiresReason && (value.reasonCode === null || value.reasonText === null)) {
      context.addIssue({ code: 'custom', message: 'Reason is required for this command' });
    }
    if (!requiresReason && hasReason) {
      context.addIssue({ code: 'custom', message: 'Reason is not allowed for this command' });
    }
  });

// ---------------------------------------------------------------------------
// link / unlink / recover-unlink stage document
// ---------------------------------------------------------------------------
export const REGISTRATION_DOCUMENT_ROLES = [
  'application_form',
  'approval_letter',
  'trade_name_approval',
  'trade_license',
  'visa_evidence',
  'bank_evidence',
  'other',
] as const;

export const linkStageDocumentSchema = z
  .object({
    registrationId: uuid,
    stageId: uuid,
    documentId: uuid,
    documentVersionId: uuid,
    role: z.enum(REGISTRATION_DOCUMENT_ROLES),
    operationId,
  })
  .strict();

export const unlinkStageDocumentSchema = z
  .object({
    registrationId: uuid,
    stageId: uuid,
    linkId: uuid,
    operationId,
  })
  .strict();

export const recoverUnlinkStageDocumentSchema = z
  .object({
    registrationId: uuid,
    stageId: uuid,
    linkId: uuid,
    reason: reasonText,
    operationId,
  })
  .strict();

// ---------------------------------------------------------------------------
// visa person: create / transition / cancel
// ---------------------------------------------------------------------------
const displayName = z
  .string()
  .trim()
   
  .refine((value) => !/[\u0000-\u001f\u007f<>]/.test(value), {
    message: 'Display name contains forbidden characters',
  })
  .refine((value) => !/\s{2,}/.test(value), {
    message: 'Display name must not contain repeated whitespace',
  })
  .refine((value) => Array.from(value).length >= 2, {
    message: 'Display name must contain at least 2 characters',
  })
  .refine((value) => Array.from(value).length <= 200, {
    message: 'Display name must contain at most 200 characters',
  });

// person_kind + visa_kind + source id pairing exactly mirrors the RPC CHECK.
export const createVisaPersonSchema = z.discriminatedUnion('personKind', [
  z
    .object({
      registrationId: uuid,
      personKind: z.literal('shareholder'),
      visaKind: z.literal('investor'),
      shareholderId: uuid,
      displayName,
      operationId,
    })
    .strict(),
  z
    .object({
      registrationId: uuid,
      personKind: z.literal('employee'),
      visaKind: z.literal('employee'),
      employeeId: uuid,
      displayName,
      operationId,
    })
    .strict(),
  z
    .object({
      registrationId: uuid,
      personKind: z.literal('dependent'),
      visaKind: z.literal('family'),
      displayName,
      operationId,
    })
    .strict(),
  z
    .object({
      registrationId: uuid,
      personKind: z.literal('other'),
      visaKind: z.literal('family'),
      displayName,
      operationId,
    })
    .strict(),
]);

export const transitionVisaPersonSchema = z
  .object({
    registrationId: uuid,
    visaPersonId: uuid,
    command: z.enum(['start', 'advance', 'block', 'unblock', 'complete']),
    toStage: z.enum(VISA_MILESTONE_CODES),
    expectedVisaVersion: expectedVersion,
    reasonCode: z.enum(VISA_TRANSITION_REASON_CODES).nullable().default(null),
    reasonText: reasonText.nullable().default(null),
    operationId,
  })
  .strict()
  .superRefine((value, context) => {
    const requiresReason = value.command === 'block' || value.command === 'unblock';
    const hasReason = value.reasonCode !== null || value.reasonText !== null;
    if (requiresReason && (value.reasonCode === null || value.reasonText === null)) {
      context.addIssue({ code: 'custom', message: 'Reason is required for this command' });
    }
    if (!requiresReason && hasReason) {
      context.addIssue({ code: 'custom', message: 'Reason is not allowed for this command' });
    }
  });

export const cancelVisaPersonSchema = z
  .object({
    registrationId: uuid,
    visaPersonId: uuid,
    expectedVisaVersion: expectedVersion,
    reasonCode: z.enum(VISA_CANCEL_REASON_CODES),
    reasonText,
    operationId,
  })
  .strict();

// ---------------------------------------------------------------------------
// read wrappers (server-derived actor context lives outside these schemas)
// ---------------------------------------------------------------------------
export const readRegistrationSchema = z.object({ registrationId: uuid }).strict();

// ---------------------------------------------------------------------------
// Admin registration query (page 1..10000, trimmed/sliced 100-char filters)
// ---------------------------------------------------------------------------
const filterText = z
  .string()
  .transform((value) => value.trim().slice(0, 100))
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

export const adminRegistrationQuerySchema = z
  .object({
    company: filterText.default(null),
    pro: filterText.default(null),
    stage: z.enum(REGISTRATION_STAGE_CODES).or(z.literal('all')).default('all'),
    status: z
      .enum(['not_started', 'in_progress', 'blocked', 'completed', 'skipped'])
      .or(z.literal('all'))
      .default('all'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict();

// ---------------------------------------------------------------------------
// Inferred input types
// ---------------------------------------------------------------------------
// Callers pass the pre-default (input) shape; the wrappers apply defaults via
// .parse(). Output shapes (post-default) are the receipt-facing internal types.
export type CreateRegistrationInput = z.input<typeof createRegistrationSchema>;
export type TransitionStageInput = z.input<typeof transitionStageSchema>;
export type LinkStageDocumentInput = z.input<typeof linkStageDocumentSchema>;
export type UnlinkStageDocumentInput = z.input<typeof unlinkStageDocumentSchema>;
export type RecoverUnlinkStageDocumentInput = z.input<typeof recoverUnlinkStageDocumentSchema>;
export type CreateVisaPersonInput = z.input<typeof createVisaPersonSchema>;
export type TransitionVisaPersonInput = z.input<typeof transitionVisaPersonSchema>;
export type CancelVisaPersonInput = z.input<typeof cancelVisaPersonSchema>;
export type ReadRegistrationInput = z.input<typeof readRegistrationSchema>;
export type AdminRegistrationQueryInput = z.output<typeof adminRegistrationQuerySchema>;
