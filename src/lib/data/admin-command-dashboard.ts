import 'server-only';
import {
  deriveAssignmentCounts,
  orderLeadStageCounts,
  resolveProHealth,
} from '@/lib/admin-dashboard/aggregates';
import {
  unavailableWidget,
  type ActivityDatum,
  type DashboardPeriod,
  type KpiDatum,
  type KpiId,
  type LeadFunnelDatum,
  type ProHealthDatum,
  type WidgetState,
} from '@/lib/admin-dashboard/contracts';
import type { LeadStage } from '@/lib/data/leads-kanban';

const ACTIVITY_LIMIT = 8;
const PRO_HEALTH_LIMIT = 5;
const ACTIVITY_ACTIONS = [
  'lead_created',
  'lead_assigned',
  'lead_stage_changed',
  'invoice_created',
  'invoice_voided',
  'invoice_marked_paid',
  'payment_succeeded',
  'refund_issued',
] as const;

type PortfolioCounts = {
  totalLeads: number;
  totalPros: number;
  activePros: number;
  totalCompanies: number;
  activeAssignments: number;
};

type AdminCommandDashboardDeps = {
  authorize: () => Promise<unknown>;
  loadPortfolio: () => Promise<PortfolioCounts>;
  loadPendingRenewals: () => Promise<number>;
  loadPendingPayments: () => Promise<number>;
  loadLeadFunnel: () => Promise<Partial<Record<LeadStage, number>>>;
  loadActivity: (period: DashboardPeriod) => Promise<ActivityDatum[]>;
  loadProHealth: () => Promise<ProHealthDatum[]>;
  logFailure: (source: string) => void;
};

export type AdminCommandDashboard = {
  period: DashboardPeriod;
  kpis: Record<KpiId, WidgetState<KpiDatum>>;
  registrationOverview: WidgetState<never>;
  leadFunnel: WidgetState<LeadFunnelDatum[]>;
  activity: WidgetState<ActivityDatum[]>;
  proHealth: WidgetState<ProHealthDatum[]>;
  revenue: WidgetState<never>;
  registrationStages: WidgetState<never>;
};

async function serviceClient() {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient();
}

async function exactCount(
  query: PromiseLike<{ count: number | null; error: { message?: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error || typeof count !== 'number') throw new Error('Exact count unavailable');
  return count;
}

async function defaultAuthorize() {
  const { requirePlatformOperator } = await import('@/lib/auth/require-role');
  return requirePlatformOperator();
}

async function defaultLoadPortfolio(): Promise<PortfolioCounts> {
  const admin = await serviceClient();
  const [totalLeads, totalPros, activePros, totalCompanies, activeAssignments] = await Promise.all([
    exactCount(
      admin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'questionnaire'),
    ),
    exactCount(
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'pro'),
    ),
    exactCount(
      admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'pro')
        .eq('status', 'active'),
    ),
    exactCount(admin.from('company_profiles').select('id', { count: 'exact', head: true })),
    exactCount(
      admin
        .from('pro_company_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
    ),
  ]);
  return { totalLeads, totalPros, activePros, totalCompanies, activeAssignments };
}

async function defaultLoadPendingRenewals(): Promise<number> {
  const admin = await serviceClient();
  return exactCount(
    admin
      .from('renewals')
      .select('id', { count: 'exact', head: true })
      .in('status', ['due_soon', 'overdue']),
  );
}

async function defaultLoadPendingPayments(): Promise<number> {
  const admin = await serviceClient();
  return exactCount(
    admin.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  );
}

async function defaultLoadLeadFunnel(): Promise<Partial<Record<LeadStage, number>>> {
  const admin = await serviceClient();
  const stages: readonly LeadStage[] = ['new', 'contacted', 'qualified', 'won', 'lost'];
  const counts = await Promise.all(
    stages.map((stage) =>
      exactCount(
        admin
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('source', 'questionnaire')
          .eq('stage', stage),
      ),
    ),
  );
  return Object.fromEntries(stages.map((stage, index) => [stage, counts[index]]));
}

async function defaultLoadActivity(period: DashboardPeriod): Promise<ActivityDatum[]> {
  const admin = await serviceClient();
  const { data, error } = await admin
    .from('tenant_audit_log')
    .select('id, action, source, created_at, tenants(name)')
    .in('action', [...ACTIVITY_ACTIONS])
    .gte('created_at', period.current.start)
    .lt('created_at', period.current.end)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (error) throw new Error('Activity source unavailable');
  return (
    (data ?? []) as unknown as Array<{
      id: number;
      action: string;
      created_at: string;
      tenants: { name: string } | Array<{ name: string }> | null;
    }>
  ).map((row) => {
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return {
      id: String(row.id),
      action: row.action,
      companyName: tenant?.name ?? null,
      createdAt: row.created_at,
    };
  });
}

async function defaultLoadProHealth(): Promise<ProHealthDatum[]> {
  const admin = await serviceClient();
  const { data: pros, error: proError } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'pro')
    .eq('status', 'active')
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(PRO_HEALTH_LIMIT);
  if (proError) throw new Error('PRO source unavailable');
  const rows = (pros ?? []) as Array<{ id: string; full_name: string | null }>;
  if (rows.length === 0) return [];
  const proIds = rows.map((row) => row.id);
  const { data: assignments, error: assignmentError } = await admin
    .from('pro_company_assignments')
    .select(
      'pro_profile_id, company:company_profiles!pro_company_assignments_company_id_fkey(company_name)',
    )
    .eq('status', 'active')
    .in('pro_profile_id', proIds);
  if (assignmentError) throw new Error('Assignment source unavailable');
  const assignmentByPro = new Map(
    (
      (assignments ?? []) as unknown as Array<{
        pro_profile_id: string;
        company: { company_name: string } | Array<{ company_name: string }> | null;
      }>
    ).map((row) => {
      const company = Array.isArray(row.company) ? row.company[0] : row.company;
      return [row.pro_profile_id, company?.company_name ?? null] as const;
    }),
  );
  return rows.map((row) => {
    const companyName = assignmentByPro.get(row.id) ?? null;
    const health = resolveProHealth(companyName ? { companyName } : null);
    return { id: row.id, name: row.full_name, ...health };
  });
}

const DEFAULT_DEPS: AdminCommandDashboardDeps = {
  authorize: defaultAuthorize,
  loadPortfolio: defaultLoadPortfolio,
  loadPendingRenewals: defaultLoadPendingRenewals,
  loadPendingPayments: defaultLoadPendingPayments,
  loadLeadFunnel: defaultLoadLeadFunnel,
  loadActivity: defaultLoadActivity,
  loadProHealth: defaultLoadProHealth,
  logFailure: (source) => console.error('Admin command dashboard source failed', { source }),
};

function dataKpi(value: number): WidgetState<KpiDatum> {
  return { state: 'data', data: { value } };
}

function sanitizedError<T>(source: string, logFailure: (source: string) => void): WidgetState<T> {
  logFailure(source);
  return { state: 'error', reason: 'sanitized' };
}

export async function loadAdminCommandDashboard(
  period: DashboardPeriod,
  overrides: Partial<AdminCommandDashboardDeps> = {},
): Promise<AdminCommandDashboard> {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  await deps.authorize();

  const [portfolio, renewals, payments, funnel, activity, proHealth] = await Promise.allSettled([
    deps.loadPortfolio(),
    deps.loadPendingRenewals(),
    deps.loadPendingPayments(),
    deps.loadLeadFunnel(),
    deps.loadActivity(period),
    deps.loadProHealth(),
  ]);

  const portfolioStates: Partial<Record<KpiId, WidgetState<KpiDatum>>> = {};
  if (portfolio.status === 'fulfilled') {
    try {
      const unassigned = deriveAssignmentCounts({
        activePros: portfolio.value.activePros,
        companies: portfolio.value.totalCompanies,
        activeAssignments: portfolio.value.activeAssignments,
      });
      Object.assign(portfolioStates, {
        totalLeads: dataKpi(portfolio.value.totalLeads),
        totalPros: dataKpi(portfolio.value.totalPros),
        totalCompanies: dataKpi(portfolio.value.totalCompanies),
        activeAssignments: dataKpi(portfolio.value.activeAssignments),
        unassignedPros: dataKpi(unassigned.unassignedPros),
        unassignedCompanies: dataKpi(unassigned.unassignedCompanies),
      });
    } catch {
      for (const id of [
        'totalLeads',
        'totalPros',
        'totalCompanies',
        'activeAssignments',
        'unassignedPros',
        'unassignedCompanies',
      ] as const) {
        portfolioStates[id] = sanitizedError(id, deps.logFailure);
      }
    }
  } else {
    for (const id of [
      'totalLeads',
      'totalPros',
      'totalCompanies',
      'activeAssignments',
      'unassignedPros',
      'unassignedCompanies',
    ] as const) {
      portfolioStates[id] = sanitizedError(id, deps.logFailure);
    }
  }

  const funnelRows = funnel.status === 'fulfilled' ? orderLeadStageCounts(funnel.value) : null;
  return {
    period,
    kpis: {
      ...(portfolioStates as Record<KpiId, WidgetState<KpiDatum>>),
      activeRegistrations: unavailableWidget('phase3'),
      pendingRenewals:
        renewals.status === 'fulfilled'
          ? dataKpi(renewals.value)
          : sanitizedError('pendingRenewals', deps.logFailure),
      pendingPayments:
        payments.status === 'fulfilled'
          ? dataKpi(payments.value)
          : sanitizedError('pendingPayments', deps.logFailure),
      documentsAwaitingReview: unavailableWidget('phase3'),
    },
    registrationOverview: unavailableWidget('phase3'),
    leadFunnel:
      funnelRows === null
        ? sanitizedError('leadFunnel', deps.logFailure)
        : funnelRows.every((row) => row.count === 0)
          ? { state: 'empty', data: funnelRows }
          : { state: 'data', data: funnelRows },
    activity:
      activity.status === 'rejected'
        ? sanitizedError('activity', deps.logFailure)
        : activity.value.length === 0
          ? { state: 'empty', data: [] }
          : { state: 'data', data: activity.value },
    proHealth:
      proHealth.status === 'rejected'
        ? sanitizedError('proHealth', deps.logFailure)
        : proHealth.value.length === 0
          ? { state: 'empty', data: [] }
          : { state: 'data', data: proHealth.value },
    revenue: unavailableWidget('phase3'),
    registrationStages: unavailableWidget('phase3'),
  };
}
