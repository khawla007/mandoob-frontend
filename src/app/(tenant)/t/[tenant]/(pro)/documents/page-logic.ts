import {
  documentCenterFocusSchema,
  documentCenterIsoDateSchema,
  documentCenterSearchSchema,
  firstDocumentCenterValue,
  normalizeDocumentCenterSearch,
  type DocumentCenterSearch,
} from '@/lib/validation/pro-document-center';
import { docTypeSchema } from '@/lib/validation/document';

export type DocumentCenterSearchParams = {
  view?: string | string[];
  sort?: string | string[];
  window?: string | string[];
  client?: string | string[];
  type?: string | string[];
  q?: string | string[];
  search?: string | string[];
  from?: string | string[];
  to?: string | string[];
  request?: string | string[];
  document?: string | string[];
  page?: string | string[];
};

function enumValue<T extends readonly [string, ...string[]]>(
  value: string | undefined,
  allowed: T,
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

function uuidValue(value: string | undefined): string | undefined {
  return documentCenterFocusSchema.shape.id.safeParse(value).success ? value : undefined;
}

function isoDateValue(value: string | undefined): string | undefined {
  return documentCenterIsoDateSchema.safeParse(value).success ? value : undefined;
}

function pageValue(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 10_000 ? parsed : undefined;
}

export function parseDocumentCenterSearch(
  search: DocumentCenterSearchParams,
): DocumentCenterSearch {
  const view = firstDocumentCenterValue(search.view);
  const sort = firstDocumentCenterValue(search.sort);
  const window = firstDocumentCenterValue(search.window);
  const parsedWindow = enumValue(window, ['all', 'overdue', '7', '30', '90']);
  const clientId = uuidValue(firstDocumentCenterValue(search.client));
  const docType = docTypeSchema.safeParse(firstDocumentCenterValue(search.type));
  const searchTerm =
    normalizeDocumentCenterSearch(firstDocumentCenterValue(search.q)) ??
    normalizeDocumentCenterSearch(firstDocumentCenterValue(search.search));
  const from = isoDateValue(firstDocumentCenterValue(search.from));
  const to = isoDateValue(firstDocumentCenterValue(search.to));
  const validDateRange = !(from && to && from > to);
  const documentId = uuidValue(firstDocumentCenterValue(search.document));
  const requestId = uuidValue(firstDocumentCenterValue(search.request));
  const focus = documentId
    ? { kind: 'document' as const, id: documentId }
    : requestId
      ? { kind: 'request' as const, id: requestId }
      : undefined;

  return documentCenterSearchSchema.parse({
    view: enumValue(view, [
      'all',
      'requested',
      'submitted',
      'approved',
      'rejected',
      'expiring',
      'overdue',
    ]),
    sort: enumValue(sort, ['urgency', 'newest', 'oldest', 'due_date', 'expiry_date']),
    window: parsedWindow,
    ...(clientId ? { clientId } : {}),
    ...(docType.success ? { docType: docType.data } : {}),
    ...(searchTerm ? { search: searchTerm } : {}),
    ...(parsedWindow !== undefined && parsedWindow !== 'all'
      ? {}
      : validDateRange
        ? { ...(from ? { from } : {}), ...(to ? { to } : {}) }
        : {}),
    ...(focus ? { focus } : {}),
    page: focus ? 1 : pageValue(firstDocumentCenterValue(search.page)),
  });
}

export function documentCenterHref(
  slug: string,
  filters: DocumentCenterSearch,
  page?: number,
): string {
  const parsed = documentCenterSearchSchema.safeParse(filters);
  if (!parsed.success) return `/t/${encodeURIComponent(slug)}/documents`;

  const value = parsed.data;
  const requestedPage = page === undefined ? value.page : pageValue(String(page));
  const params = new URLSearchParams();
  if (value.view !== 'all') params.set('view', value.view);
  if (value.sort !== 'urgency') params.set('sort', value.sort);
  if (value.window !== 'all') params.set('window', value.window);
  if (value.clientId) params.set('client', value.clientId);
  if (value.docType) params.set('type', value.docType);
  if (value.search) params.set('q', value.search);
  if (value.from) params.set('from', value.from);
  if (value.to) params.set('to', value.to);
  if (value.focus) params.set(value.focus.kind, value.focus.id);

  const targetPage = value.focus ? 1 : (requestedPage ?? value.page);
  if (targetPage !== 1) params.set('page', String(targetPage));

  const query = params.toString();
  return `/t/${encodeURIComponent(slug)}/documents${query ? `?${query}` : ''}`;
}
