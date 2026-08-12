import 'server-only';

import { calculateProFinanceDashboard } from '@/lib/data/pro-finance';

export type ProDashboardData = {
  generatedAt: string;
  kpis: {
    activeClients: number;
    openCases: number;
    renewalsDue30d: number;
    renewalsDue7d: number;
    collectedMinor: number;
    currency: string;
    collectionRate: number;
  };
  health: {
    score: number;
    overdueRatio: number;
    slaCompletionRate: number;
    blockedRatio: number;
    reminderRate: number;
    workloadBalance: number;
  };
  caseVelocity: Array<{ date: string; opened: number; completed: number }>;
  actionDeck: Array<{
    id: string;
    kind: 'case' | 'renewal' | 'document' | 'invoice';
    title: string;
    detail: string;
    clientName: string;
    ownerName: string | null;
    deadline: string | null;
    urgency: 'breached' | 'urgent' | 'soon' | 'normal';
    href: string;
  }>;
  deadlineIntensity: Array<{ date: string; morning: number; afternoon: number }>;
  finance: {
    billedMinor: number;
    paidMinor: number;
    dueSoonMinor: number;
    overdueMinor: number;
    currency: string;
  };
  renewalStreams: Record<
    'license' | 'visa' | 'eid' | 'ejari',
    { d7: number; d30: number; d60: number; d90: number }
  >;
  team: Array<{
    profileId: string;
    tenantId: string;
    name: string;
    activeCases: number;
    capacityPercent: number;
  }>;
};

type ClientInput = {
  id: string;
  tenant_id: string;
  company_name: string;
  status: string;
};

type ProfileInput = {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  role: string;
  status: string;
};

type ServiceCaseInput = {
  id: string;
  tenant_id: string;
  client_id: string;
  title: string;
  service_type: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  due_at: string | null;
  sla_due_at: string | null;
  blocked_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RenewalInput = {
  id: string;
  tenant_id: string;
  client_id: string;
  type: 'license' | 'visa' | 'eid' | 'ejari';
  label: string;
  due_date: string;
  status: string;
  last_notified_at: string | null;
};

type DocumentRequestInput = {
  id: string;
  tenant_id: string;
  client_id: string;
  label: string;
  status: string;
  due_at: string | null;
};

type DocumentInput = {
  id: string;
  tenant_id: string;
  client_id: string;
  label: string | null;
  currentVersion: { tenant_id: string; review_status: string } | null;
};

type DocumentHeadInput = Omit<DocumentInput, 'currentVersion'> & {
  current_version_id: string | null;
};

type DocumentVersionInput = {
  id: string;
  tenant_id: string;
  review_status: string;
};

type InvoiceInput = {
  id: string;
  tenant_id: string;
  client_id: string;
  label: string;
  amount_minor: number;
  currency: string;
  status: string;
  due_at: string | null;
  created_at: string;
};

type PaymentInput = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  method: string | null;
  provider: string;
  failure_reason: string | null;
  received_at: string | null;
  created_at: string;
};

type RefundInput = {
  id: string;
  tenant_id: string;
  payment_id: string;
  amount_minor: number;
  status: string;
  reason?: string | null;
  created_at?: string;
};

export type ProDashboardInput = {
  tenantId: string;
  days?: 7 | 30 | 90;
  clients: ClientInput[];
  profiles: ProfileInput[];
  serviceCases: ServiceCaseInput[];
  renewals: RenewalInput[];
  documentRequests: DocumentRequestInput[];
  documents: DocumentInput[];
  invoices: InvoiceInput[];
  payments: PaymentInput[];
  refunds: RefundInput[];
};

type Action = ProDashboardData['actionDeck'][number];
const ACTIVE_RENEWAL_STATUSES = new Set(['upcoming', 'due_soon', 'overdue']);
const CLOSED_CASE_STATUSES = new Set(['completed', 'cancelled']);
const KIND_RANK: Record<Action['kind'], number> = { case: 0, renewal: 1, document: 2, invoice: 3 };
const URGENCY_RANK: Record<Action['urgency'], number> = {
  breached: 0,
  urgent: 1,
  soon: 2,
  normal: 3,
};
const PAGE_SIZE = 500;
const TEAM_CASE_CAPACITY = 10;

export function calculateProDashboard(input: ProDashboardInput, now: Date): ProDashboardData {
  const tenantId = input.tenantId;
  const clients = input.clients.filter((row) => row.tenant_id === tenantId);
  const profiles = input.profiles.filter((row) => row.tenant_id === tenantId);
  const serviceCases = input.serviceCases.filter((row) => row.tenant_id === tenantId);
  const renewals = input.renewals.filter((row) => row.tenant_id === tenantId);
  const documentRequests = input.documentRequests.filter((row) => row.tenant_id === tenantId);
  const documents = input.documents.filter((row) => row.tenant_id === tenantId);
  const invoices = input.invoices.filter((row) => row.tenant_id === tenantId);
  const payments = input.payments.filter((row) => row.tenant_id === tenantId);
  const refunds = input.refunds.filter((row) => row.tenant_id === tenantId);
  const clientNames = new Map(clients.map((row) => [row.id, row.company_name]));
  const ownerNames = new Map(profiles.map((row) => [row.id, row.full_name]));
  const openCases = serviceCases.filter((row) => !CLOSED_CASE_STATUSES.has(row.status));
  const activeRenewals = renewals.filter((row) => ACTIVE_RENEWAL_STATUSES.has(row.status));
  const today = utcDate(now);

  const financeDashboard = calculateProFinanceDashboard({
    tenantId,
    clients,
    invoices,
    payments,
    refunds: refunds.map((row) => ({
      ...row,
      reason: row.reason ?? null,
      created_at: row.created_at ?? now.toISOString(),
    })),
    today,
  });
  const reportingInvoices = invoices.filter((row) => row.currency === financeDashboard.currency);
  const dueSoonDate = addUtcDays(today, 30);
  const openReportingInvoices = reportingInvoices.filter((row) => row.status === 'open');

  const team = profiles
    .filter((row) => row.status === 'active' && (row.role === 'pro' || row.role === 'admin'))
    .map((profile) => {
      const activeCases = openCases.filter((row) => row.assigned_to === profile.id).length;
      return {
        profileId: profile.id,
        tenantId,
        name: profile.full_name ?? 'Unnamed team member',
        activeCases,
        capacityPercent: clamp(Math.round((activeCases / TEAM_CASE_CAPACITY) * 100)),
      };
    })
    .sort(
      (left, right) => right.activeCases - left.activeCases || left.name.localeCompare(right.name),
    );

  const days = input.days ?? 30;
  const dateWindow = utcDateWindow(today, days);
  const caseVelocity = dateWindow.map((date) => ({
    date,
    opened: serviceCases.filter((row) => utcDate(new Date(row.created_at)) === date).length,
    completed: serviceCases.filter(
      (row) => row.completed_at !== null && utcDate(new Date(row.completed_at)) === date,
    ).length,
  }));

  const actions = buildActions({
    openCases,
    activeRenewals,
    documentRequests,
    documents,
    openInvoices: openReportingInvoices,
    clientNames,
    ownerNames,
    now,
  });

  const deadlineIntensity = utcFutureDateWindow(today, days).map((date) => {
    const dated = actions.filter((action) => action.deadline?.slice(0, 10) === date);
    return {
      date,
      morning: dated.filter((action) => deadlineHour(action.deadline) < 12).length,
      afternoon: dated.filter((action) => deadlineHour(action.deadline) >= 12).length,
    };
  });

  const renewalStreams = renewalStreamCounts(activeRenewals, today);
  const renewalsDue7d = activeRenewals.filter((row) => row.due_date <= addUtcDays(today, 7)).length;
  const renewalsDue30d = activeRenewals.filter((row) => row.due_date <= dueSoonDate).length;
  const overdueRatio = percent(
    openCases.filter(
      (row) => deadlineForCase(row) !== null && deadlineForCase(row)! < now.toISOString(),
    ).length,
    openCases.length,
  );
  const completedWithSla = serviceCases.filter(
    (row) => row.status === 'completed' && row.completed_at !== null && row.sla_due_at !== null,
  );
  const slaCompletionRate = percent(
    completedWithSla.filter((row) => row.completed_at! <= row.sla_due_at!).length,
    completedWithSla.length,
  );
  const blockedRatio = percent(
    openCases.filter((row) => row.blocked_reason !== null).length,
    openCases.length,
  );
  const dueForReminder = activeRenewals.filter((row) => row.due_date <= dueSoonDate);
  const reminderRate = percent(
    dueForReminder.filter((row) => row.last_notified_at !== null).length,
    dueForReminder.length,
  );
  const workloadBalance = calculateWorkloadBalance(team.map((member) => member.activeCases));
  const healthSignals = [
    100 - overdueRatio,
    slaCompletionRate,
    100 - blockedRatio,
    reminderRate,
    workloadBalance,
  ];
  const score =
    clients.length + serviceCases.length + renewals.length === 0
      ? 0
      : clamp(
          Math.round(healthSignals.reduce((sum, value) => sum + value, 0) / healthSignals.length),
        );

  return {
    generatedAt: now.toISOString(),
    kpis: {
      activeClients: clients.filter((row) => row.status === 'active').length,
      openCases: openCases.length,
      renewalsDue30d,
      renewalsDue7d,
      collectedMinor: financeDashboard.totalRevenueCollectedMinor,
      currency: financeDashboard.currency,
      collectionRate: roundOne(financeDashboard.collectionRate),
    },
    health: {
      score,
      overdueRatio,
      slaCompletionRate,
      blockedRatio,
      reminderRate,
      workloadBalance,
    },
    caseVelocity,
    actionDeck: actions,
    deadlineIntensity,
    finance: {
      billedMinor: reportingInvoices
        .filter((row) => row.status !== 'void')
        .reduce((sum, row) => sum + row.amount_minor, 0),
      paidMinor: financeDashboard.totalRevenueCollectedMinor,
      dueSoonMinor: openReportingInvoices
        .filter((row) => row.due_at !== null && row.due_at >= today && row.due_at <= dueSoonDate)
        .reduce((sum, row) => sum + row.amount_minor, 0),
      overdueMinor: openReportingInvoices
        .filter((row) => row.due_at !== null && row.due_at < today)
        .reduce((sum, row) => sum + row.amount_minor, 0),
      currency: financeDashboard.currency,
    },
    renewalStreams,
    team,
  };
}

function buildActions(args: {
  openCases: ServiceCaseInput[];
  activeRenewals: RenewalInput[];
  documentRequests: DocumentRequestInput[];
  documents: DocumentInput[];
  openInvoices: InvoiceInput[];
  clientNames: Map<string, string>;
  ownerNames: Map<string, string | null>;
  now: Date;
}): Action[] {
  const clientName = (id: string) => args.clientNames.get(id) ?? 'Unknown client';
  const actions: Action[] = [
    ...args.openCases.map((row): Action => {
      const deadline = deadlineForCase(row);
      return {
        id: row.id,
        kind: 'case',
        title: row.title,
        detail: row.service_type,
        clientName: clientName(row.client_id),
        ownerName: row.assigned_to ? (args.ownerNames.get(row.assigned_to) ?? null) : null,
        deadline,
        urgency: urgency(deadline, args.now),
        href: '/applications',
      };
    }),
    ...args.activeRenewals.map(
      (row): Action => ({
        id: row.id,
        kind: 'renewal',
        title: row.label,
        detail: `${row.type} renewal`,
        clientName: clientName(row.client_id),
        ownerName: null,
        deadline: row.due_date,
        urgency: urgency(row.due_date, args.now),
        href: '/renewals',
      }),
    ),
    ...args.documentRequests
      .filter((row) => row.status === 'pending')
      .map(
        (row): Action => ({
          id: row.id,
          kind: 'document',
          title: row.label,
          detail: 'Document request pending',
          clientName: clientName(row.client_id),
          ownerName: null,
          deadline: row.due_at,
          urgency: urgency(row.due_at, args.now),
          href: `/clients/${row.client_id}`,
        }),
      ),
    ...args.documents
      .filter((row) => currentReviewStatus(row.currentVersion, row.tenant_id) === 'pending')
      .map(
        (row): Action => ({
          id: row.id,
          kind: 'document',
          title: row.label ?? 'Document review',
          detail: 'Awaiting document review',
          clientName: clientName(row.client_id),
          ownerName: null,
          deadline: null,
          urgency: 'normal',
          href: `/clients/${row.client_id}`,
        }),
      ),
    ...args.openInvoices.map(
      (row): Action => ({
        id: row.id,
        kind: 'invoice',
        title: row.label,
        detail: `${row.currency} ${(row.amount_minor / 100).toFixed(2)}`,
        clientName: clientName(row.client_id),
        ownerName: null,
        deadline: row.due_at,
        urgency: urgency(row.due_at, args.now),
        href: `/payments/${row.id}`,
      }),
    ),
  ];

  return actions.sort((left, right) => {
    const urgencyOrder = URGENCY_RANK[left.urgency] - URGENCY_RANK[right.urgency];
    if (urgencyOrder !== 0) return urgencyOrder;
    const deadlineOrder = deadlineDate(left.deadline).localeCompare(deadlineDate(right.deadline));
    if (deadlineOrder !== 0) return deadlineOrder;
    const kindOrder = KIND_RANK[left.kind] - KIND_RANK[right.kind];
    return kindOrder !== 0 ? kindOrder : left.id.localeCompare(right.id);
  });
}

function renewalStreamCounts(
  rows: RenewalInput[],
  today: string,
): ProDashboardData['renewalStreams'] {
  const result: ProDashboardData['renewalStreams'] = {
    license: { d7: 0, d30: 0, d60: 0, d90: 0 },
    visa: { d7: 0, d30: 0, d60: 0, d90: 0 },
    eid: { d7: 0, d30: 0, d60: 0, d90: 0 },
    ejari: { d7: 0, d30: 0, d60: 0, d90: 0 },
  };
  for (const row of rows) {
    if (row.due_date <= addUtcDays(today, 7)) result[row.type].d7 += 1;
    if (row.due_date <= addUtcDays(today, 30)) result[row.type].d30 += 1;
    if (row.due_date <= addUtcDays(today, 60)) result[row.type].d60 += 1;
    if (row.due_date <= addUtcDays(today, 90)) result[row.type].d90 += 1;
  }
  return result;
}

function currentReviewStatus(
  value: DocumentInput['currentVersion'],
  tenantId: string,
): string | null {
  return value?.tenant_id === tenantId ? value.review_status : null;
}

export function associateCurrentDocumentVersions(
  documents: DocumentHeadInput[],
  versions: DocumentVersionInput[],
  tenantId: string,
): DocumentInput[] {
  const tenantVersions = new Map(
    versions
      .filter((version) => version.tenant_id === tenantId)
      .map((version) => [version.id, version]),
  );
  return documents
    .filter((document) => document.tenant_id === tenantId)
    .map(({ current_version_id: currentVersionId, ...document }) => ({
      ...document,
      currentVersion: currentVersionId ? (tenantVersions.get(currentVersionId) ?? null) : null,
    }));
}

function calculateWorkloadBalance(activeCases: number[]): number {
  if (activeCases.length === 0) return 0;
  const maximum = Math.max(...activeCases);
  if (maximum === 0) return 100;
  return clamp(Math.round((1 - (maximum - Math.min(...activeCases)) / maximum) * 100));
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : clamp(roundOne((numerator / denominator) * 100));
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return utcDate(value);
}

function utcDateWindow(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addUtcDays(today, index - days + 1));
}

function utcFutureDateWindow(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addUtcDays(today, index));
}

function deadlineForCase(row: ServiceCaseInput): string | null {
  return row.sla_due_at ?? row.due_at;
}

function urgency(deadline: string | null, now: Date): Action['urgency'] {
  if (!deadline) return 'normal';
  const timestamp =
    deadline.length === 10 ? Date.parse(`${deadline}T23:59:59.999Z`) : Date.parse(deadline);
  const days = (timestamp - now.getTime()) / 86_400_000;
  if (timestamp < now.getTime()) return 'breached';
  if (days <= 7) return 'urgent';
  if (days <= 30) return 'soon';
  return 'normal';
}

function deadlineDate(deadline: string | null): string {
  return deadline?.slice(0, 10) ?? '9999-12-31';
}

function deadlineHour(deadline: string | null): number {
  if (!deadline || deadline.length === 10) return 23;
  return new Date(deadline).getUTCHours();
}

export class ProDashboardQueryError extends Error {
  constructor(readonly source: string) {
    super(`Failed to load PRO dashboard ${source}`);
    this.name = 'ProDashboardQueryError';
  }
}

export async function collectProDashboardPages<T>(
  source: string,
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await loadPage(from, from + PAGE_SIZE - 1);
    if (result.error) throw new ProDashboardQueryError(source);
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

type ProDashboardQueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

export type ProDashboardQueryClient = {
  from(source: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(
          column: string,
          options: { ascending: boolean },
        ): {
          range(from: number, to: number): PromiseLike<ProDashboardQueryResult>;
        };
      };
    };
  };
};

export function loadProDashboardRows<T>(
  client: ProDashboardQueryClient,
  source: string,
  select: string,
  tenantId: string,
): Promise<T[]> {
  return collectProDashboardPages<T>(source, async (from, to) => {
    const result = await client
      .from(source)
      .select(select)
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .range(from, to);
    return {
      data: result.data as T[] | null,
      error: result.error,
    };
  });
}

export async function getProDashboardData(
  tenantId: string,
  days: 7 | 30 | 90 = 30,
): Promise<ProDashboardData> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  const load = <T>(source: string, select: string) =>
    loadProDashboardRows<T>(admin as unknown as ProDashboardQueryClient, source, select, tenantId);

  const [
    clients,
    profiles,
    serviceCases,
    renewals,
    documentRequests,
    documentHeads,
    documentVersions,
    invoices,
    payments,
    refunds,
  ] = await Promise.all([
    load<ClientInput>('clients', 'id, tenant_id, company_name, status'),
    load<ProfileInput>('profiles', 'id, tenant_id, full_name, role, status'),
    load<ServiceCaseInput>(
      'service_cases_ranked',
      'id, tenant_id, client_id, title, service_type, status, priority, assigned_to, due_at, sla_due_at, blocked_reason, completed_at, created_at, updated_at',
    ),
    load<RenewalInput>(
      'renewals',
      'id, tenant_id, client_id, type, label, due_date, status, last_notified_at',
    ),
    load<DocumentRequestInput>(
      'document_requests',
      'id, tenant_id, client_id, label, status, due_at',
    ),
    load<DocumentHeadInput>('documents', 'id, tenant_id, client_id, label, current_version_id'),
    load<DocumentVersionInput>('document_versions', 'id, tenant_id, review_status'),
    load<InvoiceInput>(
      'invoices',
      'id, tenant_id, client_id, label, amount_minor, currency, status, due_at, created_at',
    ),
    load<PaymentInput>(
      'payments',
      'id, tenant_id, invoice_id, amount_minor, currency, status, method, provider, failure_reason, received_at, created_at',
    ),
    load<RefundInput>(
      'refunds',
      'id, tenant_id, payment_id, amount_minor, status, reason, created_at',
    ),
  ]);
  const documents = associateCurrentDocumentVersions(documentHeads, documentVersions, tenantId);

  return calculateProDashboard(
    {
      tenantId,
      days,
      clients,
      profiles,
      serviceCases,
      renewals,
      documentRequests,
      documents,
      invoices,
      payments,
      refunds,
    },
    new Date(),
  );
}
