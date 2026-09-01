import type { LeadStage } from '@/lib/data/leads-kanban';

export type DashboardPeriodDays = 7 | 30 | 90;

export type DashboardDateRange = {
  start: string;
  end: string;
  startDate: string;
  endDate: string;
};

export type DashboardPeriod = {
  days: DashboardPeriodDays;
  generatedAt: string;
  current: DashboardDateRange;
  comparison: DashboardDateRange;
};

export type WidgetState<T> =
  | { state: 'data'; data: T }
  | { state: 'empty'; data: T }
  | { state: 'unavailable'; reason: 'phase3' }
  | { state: 'error'; reason: 'sanitized' };

export type KpiId =
  | 'totalLeads'
  | 'totalPros'
  | 'totalCompanies'
  | 'activeAssignments'
  | 'unassignedPros'
  | 'unassignedCompanies'
  | 'activeRegistrations'
  | 'pendingRenewals'
  | 'pendingPayments'
  | 'documentsAwaitingReview';

export type KpiDefinition = {
  id: KpiId;
  semantics: 'pointInTime' | 'period';
  tone: 'info' | 'orange' | 'warning' | 'urgent';
};

export const KPI_DEFINITIONS: readonly KpiDefinition[] = [
  { id: 'totalLeads', semantics: 'pointInTime', tone: 'orange' },
  { id: 'totalPros', semantics: 'pointInTime', tone: 'info' },
  { id: 'totalCompanies', semantics: 'pointInTime', tone: 'info' },
  { id: 'activeAssignments', semantics: 'pointInTime', tone: 'orange' },
  { id: 'unassignedPros', semantics: 'pointInTime', tone: 'warning' },
  { id: 'unassignedCompanies', semantics: 'pointInTime', tone: 'warning' },
  { id: 'activeRegistrations', semantics: 'period', tone: 'info' },
  { id: 'pendingRenewals', semantics: 'pointInTime', tone: 'warning' },
  { id: 'pendingPayments', semantics: 'pointInTime', tone: 'urgent' },
  { id: 'documentsAwaitingReview', semantics: 'pointInTime', tone: 'warning' },
] as const;

export type KpiDatum = { value: number };

export type LeadFunnelDatum = {
  stage: LeadStage;
  count: number;
  percentage: number;
};

export type ActivityDatum = {
  id: string;
  action: string;
  companyName: string | null;
  createdAt: string;
};

export type ProHealthDatum = {
  id: string;
  name: string | null;
  state: 'assigned' | 'unassigned';
  companyName: string | null;
};

export function unavailableWidget<T>(reason: 'phase3'): WidgetState<T> {
  return { state: 'unavailable', reason };
}
