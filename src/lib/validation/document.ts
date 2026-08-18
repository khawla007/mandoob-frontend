import { z } from 'zod';

import { calendarDateSchema } from './calendar-date';

export const DOC_TYPES = [
  'passport',
  'visa',
  'emirates_id',
  'trade_license',
  'ejari',
  'moa',
  'shareholder_id',
  'other',
  'aoa',
  'bank_reference_letter',
  'noc',
  'cv_resume',
  'office_lease',
  'medical_certificate',
  'insurance_policy',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const docTypeSchema = z.enum(DOC_TYPES);

export const uploadDocumentMetadataSchema = z.object({
  company_id: z.string().uuid(),
  doc_type: docTypeSchema,
  request_id: z.string().uuid().optional(),
  label: z.string().max(200).optional(),
});

export type UploadDocumentMetadataInput = z.infer<typeof uploadDocumentMetadataSchema>;

export const documentReviewSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('approved'),
    note: z.string().trim().max(280).optional(),
  }),
  z.object({
    status: z.literal('rejected'),
    note: z.string().trim().min(1).max(280),
  }),
]);

export type DocumentReviewInput = z.infer<typeof documentReviewSchema>;

// PRO requesting a document from the customer. due_at is an optional ISO
// date (YYYY-MM-DD) entered via <input type="date">; coerced to ISO string
// on the server before insert.
export const createDocumentRequestSchema = z.object({
  company_id: z.string().uuid(),
  doc_type: docTypeSchema,
  label: z.string().min(1).max(120),
  due_at: calendarDateSchema.optional().or(z.literal('').transform(() => undefined)),
  notes: z
    .string()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type CreateDocumentRequestInput = z.infer<typeof createDocumentRequestSchema>;

// Step 14 — customer-side upload action body. Customer never picks the
// company_id (it is resolved server-side from customer_profiles.linked_company_id),
// so this schema only covers what comes off the dialog FormData. Empty-string
// FormData values are coerced to undefined before validation so optional
// fields stay truly optional.
const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.length === 0 ? undefined : value;

export const customerUploadActionSchema = z.object({
  doc_type: docTypeSchema,
  request_id: z.preprocess(emptyStringToUndefined, z.string().uuid().optional()),
  label: z.preprocess(emptyStringToUndefined, z.string().max(140).optional()),
});

export type CustomerUploadActionInput = z.infer<typeof customerUploadActionSchema>;

const FILENAME_MAX_BASE = 100;

// Sanitises a user-supplied filename for use in a Supabase Storage path.
// Strips path separators, NULL bytes and non-ASCII; collapses whitespace;
// caps the basename length. Preserves a single trailing extension.
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/\0/g, '')
    .replace(/[\\/]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0) return 'file';

  const dotIdx = cleaned.lastIndexOf('.');
  const hasExt = dotIdx > 0 && dotIdx < cleaned.length - 1;
  const base = hasExt ? cleaned.slice(0, dotIdx) : cleaned;
  const ext = hasExt ? cleaned.slice(dotIdx) : '';

  const safeBase = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, FILENAME_MAX_BASE) || 'file';
  return `${safeBase}${ext}`;
}
