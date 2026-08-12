import type { ProDashboardData } from '@/lib/data/pro-dashboard';

export type DashboardRange = 7 | 30 | 90;
export type DashboardErrorGroup = keyof ProDashboardData['errors'];
export type DashboardErrorMessages = Record<DashboardErrorGroup, string>;

export function parseDashboardRange(value: string | string[] | undefined): DashboardRange {
  if (typeof value !== 'string') return 30;
  if (value === '7' || value === '30' || value === '90') return Number(value) as DashboardRange;
  return 30;
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
