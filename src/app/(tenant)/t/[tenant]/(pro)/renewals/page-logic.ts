export type RenewalTab = 'active' | 'completed' | 'cancelled';

export type RenewalSearchParams = {
  tab?: string | string[];
  renewal?: string | string[];
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

export function parseRenewalTab(raw: string | undefined): RenewalTab {
  return raw === 'completed' || raw === 'cancelled' ? raw : 'active';
}

export function parseRenewalSearch(search: RenewalSearchParams): {
  tab: RenewalTab;
  renewalId: string | undefined;
} {
  return {
    tab: parseRenewalTab(first(search.tab)),
    renewalId: uuid(first(search.renewal)),
  };
}
