import type { LeadStage } from '@/lib/data/leads-kanban';
import { ADMIN_DASHBOARD_LINKS } from './links';

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
  source: string;
  scope: 'platform';
  filters: readonly string[];
  formula: string;
  comparison: 'none';
  statePolicy: 'live' | 'phase3-unavailable';
  destination:
    | { kind: 'none' }
    | {
        kind: 'separate-action';
        href: (typeof ADMIN_DASHBOARD_LINKS)[keyof typeof ADMIN_DASHBOARD_LINKS];
      };
};

export const KPI_DEFINITIONS = [
  {
    id: 'totalLeads',
    semantics: 'pointInTime',
    tone: 'orange',
    source: 'leads',
    scope: 'platform',
    filters: ['source=questionnaire'],
    formula: 'exact count',
    comparison: 'none',
    statePolicy: 'live',
    destination: { kind: 'separate-action', href: ADMIN_DASHBOARD_LINKS.leads },
  },
  {
    id: 'totalPros',
    semantics: 'pointInTime',
    tone: 'info',
    source: 'profiles',
    scope: 'platform',
    filters: ['role=pro'],
    formula: 'exact count',
    comparison: 'none',
    statePolicy: 'live',
    destination: { kind: 'separate-action', href: ADMIN_DASHBOARD_LINKS.proRegistry },
  },
  {
    id: 'totalCompanies',
    semantics: 'pointInTime',
    tone: 'info',
    source: 'company_profiles',
    scope: 'platform',
    filters: [],
    formula: 'exact count',
    comparison: 'none',
    statePolicy: 'live',
    destination: { kind: 'separate-action', href: ADMIN_DASHBOARD_LINKS.companies },
  },
  {
    id: 'activeAssignments',
    semantics: 'pointInTime',
    tone: 'orange',
    source: 'pro_company_assignments',
    scope: 'platform',
    filters: ['status=active'],
    formula: 'exact count',
    comparison: 'none',
    statePolicy: 'live',
    destination: { kind: 'none' },
  },
  {
    id: 'unassignedPros',
    semantics: 'pointInTime',
    tone: 'warning',
    source: 'profiles + pro_company_assignments',
    scope: 'platform',
    filters: ['role=pro', 'status=active', 'assignment.status=active'],
    formula: 'active PROs - active assignments',
    comparison: 'none',
    statePolicy: 'live',
    destination: { kind: 'none' },
  },
  {
    id: 'unassignedCompanies',
    semantics: 'pointInTime',
    tone: 'warning',
    source: 'company_profiles + pro_company_assignments',
    scope: 'platform',
    filters: ['assignment.status=active'],
    formula: 'companies - active assignments',
    comparison: 'none',
    statePolicy: 'live',
    destination: { kind: 'none' },
  },
  {
    id: 'activeRegistrations',
    semantics: 'period',
    tone: 'info',
    source: 'phase3-registration-contract',
    scope: 'platform',
    filters: [],
    formula: 'unavailable',
    comparison: 'none',
    statePolicy: 'phase3-unavailable',
    destination: { kind: 'none' },
  },
  {
    id: 'pendingRenewals',
    semantics: 'pointInTime',
    tone: 'warning',
    source: 'renewals',
    scope: 'platform',
    filters: ['status in (due_soon,overdue)'],
    formula: 'exact count',
    comparison: 'none',
    statePolicy: 'live',
    destination: { kind: 'none' },
  },
  {
    id: 'pendingPayments',
    semantics: 'pointInTime',
    tone: 'urgent',
    source: 'invoices',
    scope: 'platform',
    filters: ['status=open'],
    formula: 'exact count; no money inference',
    comparison: 'none',
    statePolicy: 'live',
    destination: { kind: 'separate-action', href: ADMIN_DASHBOARD_LINKS.finance },
  },
  {
    id: 'documentsAwaitingReview',
    semantics: 'pointInTime',
    tone: 'warning',
    source: 'phase3-current-document-review-contract',
    scope: 'platform',
    filters: [],
    formula: 'unavailable',
    comparison: 'none',
    statePolicy: 'phase3-unavailable',
    destination: { kind: 'none' },
  },
] as const satisfies readonly KpiDefinition[];

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
