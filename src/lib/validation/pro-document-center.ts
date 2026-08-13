import { z } from 'zod';

import { docTypeSchema } from './document';

export const documentCenterViews = [
  'all',
  'requested',
  'submitted',
  'approved',
  'rejected',
  'expiring',
  'overdue',
] as const;

export const documentCenterSorts = [
  'urgency',
  'newest',
  'oldest',
  'due_date',
  'expiry_date',
] as const;

export const documentCenterWindows = ['all', 'overdue', '7', '30', '90'] as const;

export type DocumentCenterView = (typeof documentCenterViews)[number];
export type DocumentCenterSort = (typeof documentCenterSorts)[number];
export type DocumentCenterWindow = (typeof documentCenterWindows)[number];

const MAX_DOCUMENT_CENTER_PAGE = 10_000;
const MAX_DOCUMENT_CENTER_SEARCH_LENGTH = 200;

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;

  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

export const documentCenterIsoDateSchema = z.iso
  .date()
  .refine(isValidCalendarDate, { message: 'Invalid calendar date' });

export const documentCenterFocusSchema = z.object({
  kind: z.enum(['request', 'document']),
  id: z.string().uuid(),
});

export const documentCenterSearchSchema = z.object({
  view: z.enum(documentCenterViews).default('all'),
  sort: z.enum(documentCenterSorts).default('urgency'),
  window: z.enum(documentCenterWindows).default('all'),
  clientId: z.string().uuid().optional(),
  docType: docTypeSchema.optional(),
  search: z.string().trim().min(1).max(MAX_DOCUMENT_CENTER_SEARCH_LENGTH).optional(),
  from: documentCenterIsoDateSchema.optional(),
  to: documentCenterIsoDateSchema.optional(),
  focus: documentCenterFocusSchema.optional(),
  page: z.number().int().min(1).max(MAX_DOCUMENT_CENTER_PAGE).default(1),
});

export type DocumentCenterSearch = z.infer<typeof documentCenterSearchSchema>;

export const documentExpirySchema = z.object({
  document_id: z.string().uuid(),
  expires_on: z
    .union([documentCenterIsoDateSchema, z.literal('')])
    .transform((value) => value || null),
});

export type DocumentExpiryInput = z.infer<typeof documentExpirySchema>;

export function firstDocumentCenterValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeDocumentCenterSearch(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= MAX_DOCUMENT_CENTER_SEARCH_LENGTH
    ? normalized
    : undefined;
}
