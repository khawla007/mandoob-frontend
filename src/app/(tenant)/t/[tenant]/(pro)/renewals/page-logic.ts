export type RenewalTab = 'active' | 'completed' | 'cancelled';

export type RenewalSearchParams = {
  tab?: string | string[];
  renewal?: string | string[];
  target?: string | string[];
  type?: string | string[];
  days?: string | string[];
  date?: string | string[];
  period?: string | string[];
  eventTypes?: string | string[];
};

import { parseRenewalSignalFilter } from '@/lib/signal-studio-filters';

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
  type?: ReturnType<typeof parseRenewalSignalFilter>['type'];
  days?: ReturnType<typeof parseRenewalSignalFilter>['days'];
  deadlineDate?: string;
  deadlinePeriod?: 'morning' | 'afternoon';
} {
  const signal = parseRenewalSignalFilter(search);
  return {
    tab: parseRenewalTab(first(search.tab)),
    renewalId: uuid(first(search.target) ?? first(search.renewal)),
    ...(signal.type ? { type: signal.type } : {}),
    ...(signal.days ? { days: signal.days } : {}),
    ...(signal.date ? { deadlineDate: signal.date, deadlinePeriod: signal.period } : {}),
  };
}
