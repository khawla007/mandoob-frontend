import type { ProDashboardData } from '@/lib/data/pro-dashboard';

export type DashboardRange = 7 | 30 | 90;
export type DashboardFilters = { ownerId?: string; serviceType?: string };
export type DashboardErrorGroup = keyof ProDashboardData['errors'];
export type DashboardErrorMessages = Record<DashboardErrorGroup, string>;

export function parseDashboardRange(value: string | string[] | undefined): DashboardRange {
  if (typeof value !== 'string') return 30;
  if (value === '7' || value === '30' || value === '90') return Number(value) as DashboardRange;
  return 30;
}

export function parseDashboardFilters(search: {
  owner?: string | string[];
  serviceType?: string | string[];
}): DashboardFilters {
  const owner = typeof search.owner === 'string' ? search.owner : undefined;
  const serviceType =
    typeof search.serviceType === 'string' ? search.serviceType.trim() : undefined;
  return {
    ...(owner &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(owner)
      ? { ownerId: owner }
      : {}),
    ...(serviceType && serviceType.length >= 2 && serviceType.length <= 80 ? { serviceType } : {}),
  };
}

export function dashboardQuery(filters: DashboardFilters, range?: DashboardRange): string {
  const query = new URLSearchParams();
  if (range) query.set('range', String(range));
  if (filters.ownerId) query.set('owner', filters.ownerId);
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
