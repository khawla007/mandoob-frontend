import { z } from 'zod';

import { calendarDateSchema } from './calendar-date';
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

export const documentCenterIsoDateSchema = calendarDateSchema;

export const documentCenterFocusSchema = z.object({
  kind: z.enum(['request', 'document']),
  id: z.string().uuid(),
});

export const documentCenterSearchSchema = z.object({
  view: z.enum(documentCenterViews).default('all'),
  sort: z.enum(documentCenterSorts).default('urgency'),
  window: z.enum(documentCenterWindows).default('all'),
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
