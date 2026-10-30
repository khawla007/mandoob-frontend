import { z } from 'zod';

import { DOC_TYPES, docTypeSchema, type DocType } from '@/lib/validation/document';

export const ADMIN_DOCUMENT_STATES = [
  'all',
  'awaiting_upload',
  'under_review',
  'approved',
  'rejected',
  'expired',
] as const;

export type AdminDocumentState = (typeof ADMIN_DOCUMENT_STATES)[number];
export type RawAdminDocumentCenterQuery = Record<string, string | string[] | undefined>;
export type AdminDocumentCenterQuery = {
  q: string | null;
  state: AdminDocumentState;
  docType: DocType | 'all';
  page: number;
  pageSize: 25;
};

const stateSchema = z.enum(ADMIN_DOCUMENT_STATES);
const pageSchema = z.coerce.number().int().min(1).max(10_000);

function single(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export function parseAdminDocumentCenterQuery(
  raw: RawAdminDocumentCenterQuery,
): AdminDocumentCenterQuery {
  const q = single(raw.q)?.trim() ?? '';
  const state = stateSchema.safeParse(single(raw.state));
  const docType = docTypeSchema.safeParse(single(raw.docType));
  const page = pageSchema.safeParse(single(raw.page));
  return {
    q: q.length >= 1 && q.length <= 100 ? q : null,
    state: state.success ? state.data : 'all',
    docType: docType.success ? docType.data : 'all',
    page: page.success ? page.data : 1,
    pageSize: 25,
  };
}

export function adminDocumentCenterHref(query: AdminDocumentCenterQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.state !== 'all') params.set('state', query.state);
  if (query.docType !== 'all') params.set('docType', query.docType);
  if (page > 1) params.set('page', String(page));
  const suffix = params.toString();
  return suffix ? `/admin/documents?${suffix}` : '/admin/documents';
}

export const ADMIN_DOCUMENT_TYPES = DOC_TYPES;
