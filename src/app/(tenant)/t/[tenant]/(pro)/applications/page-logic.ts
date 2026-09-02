import { serviceCaseFilterSchema, serviceCaseStatuses } from '@/lib/validation/service-case';
import { applicationOpenStatuses, parseApplicationSignalFilter } from '@/lib/signal-studio-filters';

export type ApplicationSearchParams = {
  case?: string | string[];
  status?: string | string[];
  serviceType?: string | string[];
  page?: string | string[];
  view?: string | string[];
  date?: string | string[];
  period?: string | string[];
  eventTypes?: string | string[];
};

type ParsedApplicationFilters = {
  id?: string;
  status?: Array<(typeof serviceCaseStatuses)[number]>;
  service_type?: string;
  company_id?: string;
  deadlineDate?: string;
  deadlinePeriod?: 'morning' | 'afternoon';
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseApplicationPage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(first(value) ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function applicationPageHref(
  slug: string,
  filters: {
    id?: string;
    status?: string[];
    service_type?: string;
    deadlineDate?: string;
    deadlinePeriod?: 'morning' | 'afternoon';
  },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.id) params.set('case', filters.id);
  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.service_type) params.set('serviceType', filters.service_type);
  if (filters.deadlineDate && filters.deadlinePeriod) {
    params.set('date', filters.deadlineDate);
    params.set('period', filters.deadlinePeriod);
    params.set('eventTypes', 'case');
  }
  params.set('page', String(page));
  return `/t/${encodeURIComponent(slug)}/applications?${params.toString()}`;
}

export function parseApplicationFilters(search: ApplicationSearchParams): ParsedApplicationFilters {
  const signal = parseApplicationSignalFilter(search);
  const status = first(search.status)?.split(',').filter(Boolean);
  const parsed = serviceCaseFilterSchema.safeParse({
    ...(first(search.case) ? { id: first(search.case) } : {}),
    ...(status?.length ? { status } : {}),
    ...(first(search.serviceType) ? { service_type: first(search.serviceType) } : {}),
  });
  if (!parsed.success) return {};
  if ('view' in signal && signal.view === 'open') {
    return { ...parsed.data, status: [...applicationOpenStatuses] };
  }
  if ('date' in signal && signal.date) {
    return {
      ...parsed.data,
      status: parsed.data.status ?? [...applicationOpenStatuses],
      deadlineDate: signal.date,
      deadlinePeriod: signal.period,
    };
  }
  return parsed.data;
}
