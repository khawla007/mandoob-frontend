import { z } from 'zod';

import {
  PRO_CREDENTIAL_STATES,
  PRO_TERM_INTERVALS,
  PRO_TERM_KINDS,
  PRO_TERM_MODELS,
} from '@/lib/pro-lifecycle/contracts';
import { isValidCalendarDate } from './calendar-date';

const uuid = z.string().uuid();
const operationId = uuid;
const version = z.number().int().nonnegative();
const calendarDate = z.string().refine(isValidCalendarDate, { message: 'Invalid calendar date' });
const trimmedLength = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .refine((value) => Array.from(value).length >= minimum, { message: 'Value is too short' })
    .refine((value) => Array.from(value).length <= maximum, { message: 'Value is too long' });

export function normalizeProCredentialIdentifier(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/gu, '');
}

const credentialIdentifier = z
  .string()
  .transform(normalizeProCredentialIdentifier)
  .pipe(z.string().regex(/^[A-Z0-9]{4,80}$/u));

const credentialIdentifierOrBlank = z
  .string()
  .transform(normalizeProCredentialIdentifier)
  .pipe(z.string().regex(/^(?:|[A-Z0-9]{4,80})$/u));

function orderedCredentialDates(
  value: { issueDate: string; expiryDate: string },
  context: z.RefinementCtx,
) {
  if (value.issueDate > value.expiryDate) {
    context.addIssue({
      code: 'custom',
      path: ['expiryDate'],
      message: 'Expiry date must be on or after issue date',
    });
  }
}

export const proCredentialDraftSchema = z
  .object({
    identifier: credentialIdentifier,
    issuingAuthority: trimmedLength(2, 160),
    issueDate: calendarDate,
    expiryDate: calendarDate,
    expectedVersion: version,
    operationId,
  })
  .strict()
  .superRefine(orderedCredentialDates);

export const proCredentialDraftSaveSchema = z
  .object({
    identifier: credentialIdentifierOrBlank,
    issuingAuthority: trimmedLength(2, 160),
    issueDate: calendarDate,
    expiryDate: calendarDate,
    expectedVersion: version,
    operationId,
  })
  .strict()
  .superRefine(orderedCredentialDates);

const reviewBase = {
  expectedVersion: version,
  operationId,
} as const;

export const proDecisionReasonCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,63}$/u);

const structuredDecisionSecretPatterns = [
  /\bv[0-9]+:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}(?:\b|$)/u,
  /https?:\/\/[^\s]+\/storage\/v1\/object\/sign\/[^\s?]+[?&][^\s]*(?:token|signature|x-amz-signature)=/iu,
  /\b(?:identifier[ _-]*hash|sha-?256)\s*[:=]\s*[0-9a-f]{64}\b/iu,
  /\b(?:raw[ _-]*provider[ _-]*error|provider[ _-]*error\s*[:=])/iu,
] as const;

export const proDecisionReasonSchema = z
  .string()
  .superRefine((value, context) => {
    if (
      /[\u0000-\u001f\u007f]/u.test(value) ||
      /(pro-credentials\/|storage_path|identifier_ciphertext|sqlstate)/iu.test(
        value,
      ) ||
      structuredDecisionSecretPatterns.some((pattern) => pattern.test(value)) ||
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(value)
    )
      context.addIssue({ code: 'custom', message: 'Unsafe decision reason' });
  })
  .transform((value) => value.trim())
  .pipe(trimmedLength(3, 500));

export const proCredentialReviewSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('begin_review'), ...reviewBase }).strict(),
  z.object({ command: z.literal('verify'), ...reviewBase }).strict(),
  z
    .object({
      command: z.literal('reject'),
      reasonCode: proDecisionReasonCodeSchema,
      reason: proDecisionReasonSchema,
      ...reviewBase,
    })
    .strict(),
  z
    .object({
      command: z.literal('revoke'),
      reasonCode: proDecisionReasonCodeSchema,
      reason: proDecisionReasonSchema,
      ...reviewBase,
    })
    .strict(),
]);

export const PRO_CREDENTIAL_EVIDENCE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export const PRO_CREDENTIAL_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export const proCredentialEvidenceMetadataSchema = z
  .object({
    mimeType: z.enum(PRO_CREDENTIAL_EVIDENCE_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(PRO_CREDENTIAL_EVIDENCE_MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    originalNameSafe: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[^/\\\u0000-\u001f\u007f]+$/u),
    scanProvider: trimmedLength(1, 80),
    scanCompletedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const proCommercialTermSchema = z
  .object({
    termKind: z.enum(PRO_TERM_KINDS),
    model: z.enum(PRO_TERM_MODELS),
    currency: z.literal('AED'),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    retainerInterval: z.enum(PRO_TERM_INTERVALS).nullable(),
    effectiveFrom: calendarDate,
    effectiveTo: calendarDate.nullable(),
    operationId,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.model === 'retainer' && value.retainerInterval === null) {
      context.addIssue({
        code: 'custom',
        path: ['retainerInterval'],
        message: 'Retainer interval is required',
      });
    }
    if (value.model === 'per_registration' && value.retainerInterval !== null) {
      context.addIssue({
        code: 'custom',
        path: ['retainerInterval'],
        message: 'Per-registration terms cannot have an interval',
      });
    }
    if (value.effectiveTo !== null && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Effective end must be on or after effective start',
      });
    }
  });

const page = z.preprocess(
  (value) => (typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value),
  z.number().int().min(1).max(1_000_000),
);

export const proRegistryFiltersSchema = z
  .object({
    role: z.literal('pro'),
    q: z.string().trim().min(1).max(160).optional(),
    accountStatus: z.enum(['invited', 'active', 'inactive']).optional(),
    credentialState: z.enum(PRO_CREDENTIAL_STATES).optional(),
    eligibility: z.enum(['eligible', 'ineligible']).optional(),
    assignment: z.enum(['assigned', 'unassigned']).optional(),
    expiryWindow: z.enum(['expired', '30_days', '60_days', '90_days']).optional(),
    sort: z.enum(['created_at', 'full_name', 'credential_expiry', 'state']).optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    page: page.optional(),
  })
  .strict();

const timelineCursorPayloadSchema = z
  .object({
    eventAt: z.string().datetime({ offset: true }),
    eventId: uuid,
  })
  .strict();

export type ProTimelineCursor = z.infer<typeof timelineCursorPayloadSchema>;

export function decodeProTimelineCursor(cursor: string): ProTimelineCursor {
  if (!/^[A-Za-z0-9_-]+$/u.test(cursor)) throw new Error('Invalid timeline cursor');
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return timelineCursorPayloadSchema.parse(JSON.parse(decoded));
  } catch {
    throw new Error('Invalid timeline cursor');
  }
}

export const proTimelineCursorSchema = z.string().superRefine((value, context) => {
  try {
    decodeProTimelineCursor(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid timeline cursor' });
  }
});
