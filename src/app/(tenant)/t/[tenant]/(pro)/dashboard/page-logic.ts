import type { ProDashboardData } from '@/lib/data/pro-dashboard';

export type DashboardRange = 7 | 30 | 90;
export type DashboardFilters = { serviceType?: string };
export type DashboardErrorGroup = keyof ProDashboardData['errors'];
export type DashboardErrorMessages = Record<DashboardErrorGroup, string>;
export type ParsedDashboardFilters = { filters: DashboardFilters; invalid: boolean };

export function parseDashboardRange(value: string | string[] | undefined): DashboardRange {
  if (typeof value !== 'string') return 30;
  if (value === '7' || value === '30' || value === '90') return Number(value) as DashboardRange;
  return 30;
}

export function parseDashboardFilters(search: {
  serviceType?: string | string[];
}): ParsedDashboardFilters {
  const serviceType =
    typeof search.serviceType === 'string' ? search.serviceType.trim() : undefined;
  const validService = Boolean(serviceType && serviceType.length >= 2 && serviceType.length <= 80);
  return {
    filters: {
      ...(validService ? { serviceType } : {}),
    },
    invalid: Array.isArray(search.serviceType) || Boolean(serviceType && !validService),
  };
}

export function resolveDashboardFilterState(
  requested: ParsedDashboardFilters,
  applied: DashboardFilters,
  operationsUnavailable: boolean,
): { filters: DashboardFilters; notice?: 'invalid' | 'pending' } {
  if (operationsUnavailable) {
    const hasRequestedFilter = Boolean(requested.filters.serviceType);
    return {
      filters: requested.filters,
      ...(requested.invalid
        ? { notice: 'invalid' as const }
        : hasRequestedFilter
          ? { notice: 'pending' as const }
          : {}),
    };
  }
  const membershipRejected = requested.filters.serviceType !== applied.serviceType;
  return {
    filters: applied,
    ...(requested.invalid || membershipRejected ? { notice: 'invalid' as const } : {}),
  };
}

export function dashboardQuery(filters: DashboardFilters, range?: DashboardRange): string {
  const query = new URLSearchParams();
  if (range) query.set('range', String(range));
  if (filters.serviceType) query.set('serviceType', filters.serviceType);
  return query.toString();
}

export function dashboardWidgetState(
  errors: ProDashboardData['errors'],
  groups: readonly DashboardErrorGroup[],
  messages: DashboardErrorMessages,
  retryHref: string,
): { kind: 'error'; message: string; retryHref: string } | undefined {
  const failedGroup = groups.find((group) => errors[group] !== undefined);
  if (!failedGroup) return undefined;
  return { kind: 'error', message: messages[failedGroup], retryHref };
}
