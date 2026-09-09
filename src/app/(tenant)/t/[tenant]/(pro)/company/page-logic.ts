export const ASSIGNED_COMPANY_TABS = [
  'overview',
  'documents',
  'renewals',
  'payments',
  'activity',
] as const;

export type AssignedCompanyTab = (typeof ASSIGNED_COMPANY_TABS)[number];
export type AssignedCompanySearchParams = {
  tab?: string | string[];
  document?: string | string[];
  request?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function uuid(value: string | undefined): string | undefined {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

export function parseAssignedCompanySearch(search: AssignedCompanySearchParams): {
  tab: AssignedCompanyTab;
  documentId: string | undefined;
  requestId: string | undefined;
} {
  const rawTab = first(search.tab);
  return {
    tab: ASSIGNED_COMPANY_TABS.includes(rawTab as AssignedCompanyTab)
      ? (rawTab as AssignedCompanyTab)
      : 'overview',
    documentId: uuid(first(search.document)),
    requestId: uuid(first(search.request)),
  };
}

export function buildAssignedCompanyHref(
  slug: string,
  focus: ReturnType<typeof parseAssignedCompanySearch>,
): string {
  const href = `/t/${encodeURIComponent(slug)}/company`;
  const query = new URLSearchParams();
  if (focus.tab !== 'overview') query.set('tab', focus.tab);
  if (focus.documentId) query.set('document', focus.documentId);
  else if (focus.requestId) query.set('request', focus.requestId);
  return query.size > 0 ? `${href}?${query}` : href;
}
