export type ClientDetailTab = 'overview' | 'documents' | 'renewals' | 'invoices' | 'communications';

export type ClientDetailSearchParams = {
  tab?: string | string[];
  request?: string | string[];
  document?: string | string[];
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

export function parseClientDetailSearch(search: ClientDetailSearchParams): {
  tab: ClientDetailTab;
  requestId: string | undefined;
  documentId: string | undefined;
} {
  const rawTab = first(search.tab);
  const validTabs: ClientDetailTab[] = [
    'overview',
    'documents',
    'renewals',
    'invoices',
    'communications',
  ];
  return {
    tab: validTabs.includes(rawTab as ClientDetailTab) ? (rawTab as ClientDetailTab) : 'overview',
    requestId: uuid(first(search.request)),
    documentId: uuid(first(search.document)),
  };
}
