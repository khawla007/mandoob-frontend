import 'server-only';

import { calculateProFinanceDashboard } from '@/lib/data/pro-finance';

export type ProDashboardData = {
  generatedAt: string;
  totalPrioritySignals: number;
  kpis: {
    activeCompany: number;
    openCases: number;
    movingCases: number;
    blockedCases: number;
    renewalsDue30d: number;
    renewalsDue7d: number;
    collectedMinor: number;
    currency: string;
    collectionRate: number;
  };
  caseVelocity: Array<{ date: string; opened: number; completed: number }>;
  actionDeck: Array<{
    id: string;
    kind: 'case' | 'renewal' | 'document' | 'invoice';
    title: string;
    detail: string;
    companyName: string;
    deadline: string | null;
    urgency: 'breached' | 'urgent' | 'soon' | 'normal';
    href: string;
  }>;
  deadlineIntensity: Array<{ date: string; morning: number; afternoon: number }>;
  deadlineEvents: Array<{
    id: string;
    date: string;
    period: 'morning' | 'afternoon';
    eventType: 'case' | 'renewal' | 'document' | 'invoice';
    href: string;
    title: string;
    companyName: string;
  }>;
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
  pendingDocuments: Array<{
    id: string;
    label: string;
    state: 'awaiting-upload' | 'review-pending' | 'action-required';
    deadline: string | null;
    href: string;
  }>;
  filterOptions: {
    serviceTypes: string[];
  };
  appliedFilters: { serviceType?: string };
  filtersRejected: boolean;
  errors: Partial<
    Record<'identity' | 'links' | 'operations' | 'renewals' | 'documents' | 'finance', string>
  >;
};

type CompanyInput = {
  id: string;
  tenant_id: string;
  company_name: string;
  status: string;
  created_at?: string;
};

type ServiceCaseInput = {
  id: string;
  tenant_id: string;
  company_id: string;
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
  company_id: string;
  type: 'license' | 'visa' | 'eid' | 'ejari';
  label: string;
  due_date: string;
  status: string;
  notify_at?: string[];
  last_notified_at: string | null;
};

type DocumentRequestInput = {
  id: string;
  tenant_id: string;
  company_id: string;
  label: string;
  status: string;
  due_at: string | null;
};

type DocumentInput = {
  id: string;
  tenant_id: string;
  company_id: string;
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
  company_id: string;
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
  reason: string | null;
  created_at: string;
};

export type ProDashboardInput = {
  tenantId: string;
  assignedCompanyId: string;
  tenantSlug?: string;
  days?: 7 | 30 | 90;
  companies: CompanyInput[];
  serviceCases: ServiceCaseInput[];
  renewals: RenewalInput[];
  documentRequests: DocumentRequestInput[];
  documents: DocumentInput[];
  invoices: InvoiceInput[];
  payments: PaymentInput[];
  refunds: RefundInput[];
  errors?: ProDashboardData['errors'];
  filters?: { serviceType?: string };
};

type Action = ProDashboardData['actionDeck'][number];
/** Cumulative horizons contain the active overdue backlog plus upcoming work; terminal rows stay out. */
const ACTIVE_RENEWAL_STATUSES = new Set(['upcoming', 'due_soon', 'overdue']);
const CLOSED_CASE_STATUSES = new Set(['completed', 'cancelled']);
const PAGE_SIZE = 500;
const ID_BATCH_SIZE = 100;
const BUSINESS_TIME_ZONE = 'Asia/Dubai';
const COLLECTED_PAYMENT_STATUSES = new Set(['succeeded', 'refunded', 'partially_refunded']);

export function calculateProDashboard(input: ProDashboardInput, now: Date): ProDashboardData {
  const tenantId = input.tenantId;
  const companies = input.companies.filter(
    (row) => row.tenant_id === tenantId && row.id === input.assignedCompanyId,
  );
  const assignedCompany = companies[0];
  const companyIds = new Set(assignedCompany ? [assignedCompany.id] : []);
  const tenantServiceCases = input.serviceCases.filter(
    (row) => row.tenant_id === tenantId && companyIds.has(row.company_id),
  );
  const serviceTypes = Array.from(
    new Set(tenantServiceCases.map((row) => row.service_type)),
  ).sort();
  const appliedFilters = {
    ...(input.filters?.serviceType && serviceTypes.includes(input.filters.serviceType)
      ? { serviceType: input.filters.serviceType }
      : {}),
  };
  const filtersRejected = Boolean(input.filters?.serviceType && !appliedFilters.serviceType);
  const serviceCases = tenantServiceCases.filter(
    (row) => !appliedFilters.serviceType || row.service_type === appliedFilters.serviceType,
  );
  const renewals = input.renewals.filter(
    (row) => row.tenant_id === tenantId && companyIds.has(row.company_id),
  );
  const documentRequests = input.documentRequests.filter(
    (row) => row.tenant_id === tenantId && companyIds.has(row.company_id),
  );
  const documents = input.documents.filter(
    (row) => row.tenant_id === tenantId && companyIds.has(row.company_id),
  );
  const invoices = input.invoices.filter(
    (row) => row.tenant_id === tenantId && companyIds.has(row.company_id),
  );
  const invoiceIds = new Set(invoices.map((row) => row.id));
  const payments = input.payments.filter(
    (row) => row.tenant_id === tenantId && invoiceIds.has(row.invoice_id),
  );
  const paymentIds = new Set(payments.map((row) => row.id));
  const refunds = input.refunds.filter(
    (row) => row.tenant_id === tenantId && paymentIds.has(row.payment_id),
  );
  const companyNames = new Map(companies.map((row) => [row.id, row.company_name]));
  const openCases = serviceCases.filter((row) => !CLOSED_CASE_STATUSES.has(row.status));
  const activeRenewals = renewals.filter((row) => ACTIVE_RENEWAL_STATUSES.has(row.status));
  const today = businessDate(now);
  const currentMonth = today.slice(0, 7);

  const financeDashboard = calculateProFinanceDashboard({
    tenantId,
    companies: assignedCompany ? [assignedCompany] : [],
    invoices,
    payments,
    refunds,
    today,
  });
  const reportingInvoices = invoices.filter((row) => row.currency === financeDashboard.currency);
  const dueSoonDate = addUtcDays(today, 30);
  const openReportingInvoices = reportingInvoices.filter((row) => row.status === 'open');
  const currentPeriodInvoices = reportingInvoices.filter(
    (row) =>
      businessMonth(row.created_at) === currentMonth &&
      row.status !== 'draft' &&
      row.status !== 'void',
  );
  const paymentById = new Map(payments.map((row) => [row.id, row]));
  const currentPeriodPayments = payments.filter(
    (row) =>
      row.currency === financeDashboard.currency &&
      COLLECTED_PAYMENT_STATUSES.has(row.status) &&
      row.received_at !== null &&
      businessMonth(row.received_at) === currentMonth,
  );
  const currentPeriodRefunds = refunds.filter((row) => {
    const payment = paymentById.get(row.payment_id);
    return (
      row.status === 'succeeded' &&
      payment?.currency === financeDashboard.currency &&
      businessMonth(row.created_at) === currentMonth
    );
  });
  const collectedMinor =
    currentPeriodPayments.reduce((sum, row) => sum + row.amount_minor, 0) -
    currentPeriodRefunds.reduce((sum, row) => sum + row.amount_minor, 0);
  const billedMinor = currentPeriodInvoices.reduce((sum, row) => sum + row.amount_minor, 0);
  const blockedCases = openCases.filter((row) => row.blocked_reason !== null);
  const movingCases = openCases.filter((row) => row.blocked_reason === null);

  const days = input.days ?? 30;
  const dateWindow = utcDateWindow(today, days);
  const openedByDate = countByDate(serviceCases.map((row) => row.created_at));
  const completedByDate = countByDate(
    serviceCases.flatMap((row) => (row.completed_at ? [row.completed_at] : [])),
  );
  const caseVelocity = dateWindow.map((date) => ({
    date,
    opened: openedByDate.get(date) ?? 0,
    completed: completedByDate.get(date) ?? 0,
  }));

  const rankedActions = buildActions({
    openCases,
    activeRenewals,
    documentRequests,
    documents,
    openInvoices: openReportingInvoices,
    companyNames,
    now,
    tenantSlug: input.tenantSlug,
  });
  const actionDeck = selectActionDeck(rankedActions);
  const base = input.tenantSlug ? `/t/${encodeURIComponent(input.tenantSlug)}` : null;
  const pendingDocuments = [
    ...documents.flatMap((row) => {
      const reviewStatus = currentReviewStatus(row.currentVersion, row.tenant_id);
      if (reviewStatus !== 'pending' && reviewStatus !== 'rejected') return [];
      return [
        {
          id: row.id,
          label: row.label ?? 'Document review',
          state:
            reviewStatus === 'rejected'
              ? ('action-required' as const)
              : ('review-pending' as const),
          deadline: null,
          href: base ? `${base}/company?tab=documents&document=${encodeURIComponent(row.id)}` : '#',
        },
      ];
    }),
    ...documentRequests.flatMap((row) =>
      row.status === 'pending'
        ? [
            {
              id: row.id,
              label: row.label,
              state: 'awaiting-upload' as const,
              deadline: row.due_at,
              href: base
                ? `${base}/company?tab=documents&request=${encodeURIComponent(row.id)}`
                : '#',
            },
          ]
        : [],
    ),
  ]
    .sort(
      (left, right) =>
        (left.state === 'action-required' ? 0 : 1) - (right.state === 'action-required' ? 0 : 1) ||
        deadlineDate(left.deadline).localeCompare(deadlineDate(right.deadline)) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 5);

  const deadlineEvents = rankedActions.flatMap((action) => {
    if (!action.deadline) return [];
    const parts = businessDeadlineParts(action.deadline);
    return [
      {
        id: action.id,
        date: parts.date,
        period: parts.period,
        eventType: action.kind,
        href: action.href,
        title: action.title,
        companyName: action.companyName,
      },
    ];
  });
  const eventsByDate = new Map<string, typeof deadlineEvents>();
  for (const event of deadlineEvents) {
    const events = eventsByDate.get(event.date) ?? [];
    events.push(event);
    eventsByDate.set(event.date, events);
  }
  const deadlineIntensity = utcFutureDateWindow(today, days).map((date) => {
    const dated = eventsByDate.get(date) ?? [];
    return {
      date,
      morning: dated.filter((event) => event.period === 'morning').length,
      afternoon: dated.filter((event) => event.period === 'afternoon').length,
    };
  });

  const renewalStreams = renewalStreamCounts(activeRenewals, today);
  const renewalsDue7d = activeRenewals.filter((row) => row.due_date <= addUtcDays(today, 7)).length;
  const renewalsDue30d = activeRenewals.filter((row) => row.due_date <= dueSoonDate).length;
  const activeCompany = assignedCompany?.status === 'active' ? 1 : 0;

  return {
    generatedAt: now.toISOString(),
    totalPrioritySignals: rankedActions.length,
    kpis: {
      activeCompany,
      openCases: openCases.length,
      movingCases: movingCases.length,
      blockedCases: blockedCases.length,
      renewalsDue30d,
      renewalsDue7d,
      collectedMinor,
      currency: financeDashboard.currency,
      collectionRate: billedMinor > 0 ? roundOne((collectedMinor / billedMinor) * 100) : 0,
    },
    caseVelocity,
    actionDeck,
    deadlineIntensity,
    deadlineEvents,
    finance: {
      billedMinor,
      paidMinor: collectedMinor,
      dueSoonMinor: openReportingInvoices
        .filter((row) => row.due_at !== null && row.due_at >= today && row.due_at <= dueSoonDate)
        .reduce((sum, row) => sum + row.amount_minor, 0),
      overdueMinor: openReportingInvoices
        .filter((row) => row.due_at !== null && row.due_at < today)
        .reduce((sum, row) => sum + row.amount_minor, 0),
      currency: financeDashboard.currency,
    },
    renewalStreams,
    pendingDocuments,
    filterOptions: {
      serviceTypes,
    },
    appliedFilters,
    filtersRejected,
    errors: input.errors ?? {},
  };
}

function buildActions(args: {
  openCases: ServiceCaseInput[];
  activeRenewals: RenewalInput[];
  documentRequests: DocumentRequestInput[];
  documents: DocumentInput[];
  openInvoices: InvoiceInput[];
  companyNames: Map<string, string>;
  now: Date;
  tenantSlug?: string;
}): Action[] {
  const companyName = (id: string) => args.companyNames.get(id) ?? 'Unknown company';
  const base = args.tenantSlug ? `/t/${encodeURIComponent(args.tenantSlug)}` : null;
  const actions: Action[] = [
    ...args.openCases.map((row): Action => {
      const deadline = deadlineForCase(row);
      return {
        id: row.id,
        kind: 'case',
        title: row.title,
        detail: row.blocked_reason
          ? `${row.service_type} — ${row.blocked_reason}`
          : row.service_type,
        companyName: companyName(row.company_id),
        deadline,
        urgency: urgency(deadline, args.now),
        href: base ? `${base}/applications?case=${encodeURIComponent(row.id)}` : '#',
      };
    }),
    ...args.activeRenewals.map(
      (row): Action => ({
        id: row.id,
        kind: 'renewal',
        title: row.label,
        detail: `${row.type} renewal`,
        companyName: companyName(row.company_id),
        deadline: row.due_date,
        urgency: urgency(row.due_date, args.now),
        href: base ? `${base}/renewals?tab=active&renewal=${encodeURIComponent(row.id)}` : '#',
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
          companyName: companyName(row.company_id),
          deadline: row.due_at,
          urgency: urgency(row.due_at, args.now),
          href: base ? `${base}/company?tab=documents&request=${encodeURIComponent(row.id)}` : '#',
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
          companyName: companyName(row.company_id),
          deadline: null,
          urgency: 'normal',
          href: base ? `${base}/company?tab=documents&document=${encodeURIComponent(row.id)}` : '#',
        }),
      ),
    ...args.openInvoices.map(
      (row): Action => ({
        id: row.id,
        kind: 'invoice',
        title: row.label,
        detail: `${row.currency} ${(row.amount_minor / 100).toFixed(2)}`,
        companyName: companyName(row.company_id),
        deadline: row.due_at,
        urgency: urgency(row.due_at, args.now),
        href: base ? `${base}/payments/${encodeURIComponent(row.id)}` : '#',
      }),
    ),
  ];

  const cases = new Map(args.openCases.map((row) => [row.id, row]));
  return actions.sort((left, right) => compareActions(left, right, cases, args.now));
}

function compareActions(
  left: Action,
  right: Action,
  cases: Map<string, ServiceCaseInput>,
  now: Date,
): number {
  const signalRank = (action: Action): number => {
    const row = action.kind === 'case' ? cases.get(action.id) : undefined;
    if (row?.sla_due_at) return 0;
    if (action.kind === 'renewal') return 1;
    if (row?.blocked_reason) return 2;
    if (action.kind === 'document') return 3;
    if (action.kind === 'case') return 4;
    return 5;
  };
  const rank = signalRank(left) - signalRank(right);
  if (rank !== 0) return rank;
  if (left.kind === 'case' && right.kind === 'case') {
    const leftCase = cases.get(left.id)!;
    const rightCase = cases.get(right.id)!;
    if (leftCase.sla_due_at && rightCase.sla_due_at) {
      const leftBreached = businessDeadlineTimestamp(leftCase.sla_due_at) < now.getTime() ? 0 : 1;
      const rightBreached = businessDeadlineTimestamp(rightCase.sla_due_at) < now.getTime() ? 0 : 1;
      return (
        leftBreached - rightBreached ||
        businessDeadlineTimestamp(leftCase.sla_due_at) -
          businessDeadlineTimestamp(rightCase.sla_due_at) ||
        left.id.localeCompare(right.id)
      );
    }
    if (leftCase.blocked_reason && rightCase.blocked_reason) {
      return Date.parse(leftCase.updated_at) - Date.parse(rightCase.updated_at);
    }
    const priority: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    return (
      priority[leftCase.priority] - priority[rightCase.priority] || left.id.localeCompare(right.id)
    );
  }
  return (
    deadlineDate(left.deadline).localeCompare(deadlineDate(right.deadline)) ||
    left.id.localeCompare(right.id)
  );
}

function selectActionDeck(rankedActions: Action[]): Action[] {
  return rankedActions.slice(0, 5);
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

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function businessDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function businessMonth(timestamp: string): string {
  return businessDate(new Date(timestamp)).slice(0, 7);
}

function businessDeadlineParts(deadline: string): {
  date: string;
  period: 'morning' | 'afternoon';
} {
  if (deadline.length === 10) return { date: deadline, period: 'afternoon' };
  const value = new Date(deadline);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  const hour = Number(part('hour'));
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    period: hour < 12 ? 'morning' : 'afternoon',
  };
}

function businessDeadlineTimestamp(deadline: string): number {
  // Date-only deadlines expire at the end of the Dubai business date (UTC+04:00).
  return Date.parse(deadline.length === 10 ? `${deadline}T19:59:59.999Z` : deadline);
}

function countByDate(timestamps: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const timestamp of timestamps) {
    const date = businessDate(new Date(timestamp));
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
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
  const timestamp = businessDeadlineTimestamp(deadline);
  const days = (timestamp - now.getTime()) / 86_400_000;
  if (timestamp < now.getTime()) return 'breached';
  if (days <= 7) return 'urgent';
  if (days <= 30) return 'soon';
  return 'normal';
}

function deadlineDate(deadline: string | null): string {
  return deadline?.slice(0, 10) ?? '9999-12-31';
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
      eq(column: string, value: string): ProDashboardScopedQuery;
    };
  };
};

type ProDashboardScopedQuery = {
  eq?: (column: string, value: string) => ProDashboardScopedQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): {
    range(from: number, to: number): PromiseLike<ProDashboardQueryResult>;
  };
};

export function loadProDashboardRows<T>(
  client: ProDashboardQueryClient,
  source: string,
  select: string,
  tenantId: string,
  ownership?: { column: string; value: string },
): Promise<T[]> {
  return collectProDashboardPages<T>(source, async (from, to) => {
    let query = client.from(source).select(select).eq('tenant_id', tenantId);
    if (ownership) {
      if (!query.eq) throw new ProDashboardQueryError(source);
      query = query.eq(ownership.column, ownership.value);
    }
    const result = await query.order('id', { ascending: true }).range(from, to);
    return {
      data: result.data as T[] | null,
      error: result.error,
    };
  });
}

type ProDashboardErrorGroup = keyof ProDashboardData['errors'];
const SOURCE_ERROR_GROUPS: Record<string, ProDashboardErrorGroup> = {
  tenantSlug: 'links',
  companies: 'identity',
  serviceCases: 'operations',
  renewals: 'renewals',
  documentRequests: 'documents',
  documentHeads: 'documents',
  documentVersions: 'documents',
  invoices: 'finance',
  payments: 'finance',
  refunds: 'finance',
};

export async function settleProDashboardSources<T extends Record<string, PromiseLike<unknown[]>>>(
  sources: T,
): Promise<{
  data: { [K in keyof T]: T[K] extends PromiseLike<infer Rows> ? Rows : never };
  errors: ProDashboardData['errors'];
}> {
  const entries = Object.entries(sources);
  const settled = await Promise.allSettled(entries.map(([, source]) => Promise.resolve(source)));
  const data: Record<string, unknown[]> = {};
  const errors: ProDashboardData['errors'] = {};
  const failedGroups = new Set<ProDashboardErrorGroup>();

  settled.forEach((result, index) => {
    const source = entries[index][0];
    if (result.status === 'fulfilled') return;
    const group = SOURCE_ERROR_GROUPS[source] ?? 'operations';
    failedGroups.add(group);
    if (!errors[group]) {
      errors[group] =
        result.reason instanceof ProDashboardQueryError
          ? result.reason.message
          : `Failed to load PRO dashboard ${source}`;
    }
  });
  settled.forEach((result, index) => {
    const source = entries[index][0];
    const group = SOURCE_ERROR_GROUPS[source] ?? 'operations';
    data[source] = result.status === 'fulfilled' && !failedGroups.has(group) ? result.value : [];
  });

  return {
    data: data as {
      [K in keyof T]: T[K] extends PromiseLike<infer Rows> ? Rows : never;
    },
    errors,
  };
}

type ProDashboardIdQueryClient = {
  from(source: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        in(
          column: string,
          values: string[],
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
};

export async function loadReferencedDocumentVersions(
  client: ProDashboardIdQueryClient,
  documents: DocumentHeadInput[],
  tenantId: string,
): Promise<DocumentVersionInput[]> {
  const ids = Array.from(
    new Set(
      documents
        .filter((document) => document.tenant_id === tenantId)
        .flatMap((document) => (document.current_version_id ? [document.current_version_id] : [])),
    ),
  );
  const versions: DocumentVersionInput[] = [];
  for (let offset = 0; offset < ids.length; offset += ID_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + ID_BATCH_SIZE);
    versions.push(
      ...(await collectProDashboardPages<DocumentVersionInput>(
        'document_versions',
        async (from, to) => {
          const result = await client
            .from('document_versions')
            .select('id, tenant_id, review_status')
            .eq('tenant_id', tenantId)
            .in('id', batch)
            .order('id', { ascending: true })
            .range(from, to);
          return { data: result.data as DocumentVersionInput[] | null, error: result.error };
        },
      )),
    );
  }
  return versions;
}

type ProDashboardTenantQueryClient = {
  from(source: 'tenants'): {
    select(columns: 'slug'): {
      eq(
        column: 'id',
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: { slug: string } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

async function loadTenantSlug(
  client: ProDashboardTenantQueryClient,
  tenantId: string,
): Promise<string[]> {
  const result = await client.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
  if (result.error || !result.data?.slug) throw new ProDashboardQueryError('tenant');
  return [result.data.slug];
}

export async function getProDashboardData(
  tenantId: string,
  assignedCompanyId: string,
  days: 7 | 30 | 90 = 30,
  filters?: { serviceType?: string },
): Promise<ProDashboardData> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  const load = <T>(source: string, select: string, ownership?: { column: string; value: string }) =>
    loadProDashboardRows<T>(
      admin as unknown as ProDashboardQueryClient,
      source,
      select,
      tenantId,
      ownership,
    );
  const companyOwnership = { column: 'company_id', value: assignedCompanyId };

  const documentHeadsPromise = load<DocumentHeadInput>(
    'documents',
    'id, tenant_id, company_id, label, current_version_id',
    companyOwnership,
  );
  const documentVersionsPromise: Promise<DocumentVersionInput[]> = documentHeadsPromise.then(
    (documents) =>
      loadReferencedDocumentVersions(
        admin as unknown as ProDashboardIdQueryClient,
        documents,
        tenantId,
      ),
  );
  const settled = await settleProDashboardSources({
    tenantSlug: loadTenantSlug(admin as unknown as ProDashboardTenantQueryClient, tenantId),
    companies: load<CompanyInput>(
      'company_profiles',
      'id, tenant_id, company_name, status, created_at',
      { column: 'id', value: assignedCompanyId },
    ),
    serviceCases: load<ServiceCaseInput>(
      'service_cases_ranked',
      'id, tenant_id, company_id, title, service_type, status, priority, assigned_to, due_at, sla_due_at, blocked_reason, completed_at, created_at, updated_at',
      companyOwnership,
    ),
    renewals: load<RenewalInput>(
      'renewals',
      'id, tenant_id, company_id, type, label, due_date, status, notify_at, last_notified_at',
      companyOwnership,
    ),
    documentRequests: load<DocumentRequestInput>(
      'document_requests',
      'id, tenant_id, company_id, label, status, due_at',
      companyOwnership,
    ),
    documentHeads: documentHeadsPromise,
    documentVersions: documentVersionsPromise,
    invoices: load<InvoiceInput>(
      'invoices',
      'id, tenant_id, company_id, label, amount_minor, currency, status, due_at, created_at',
      companyOwnership,
    ),
    payments: load<PaymentInput>(
      'payments',
      'id, tenant_id, invoice_id, amount_minor, currency, status, method, provider, failure_reason, received_at, created_at',
    ),
    refunds: load<RefundInput>(
      'refunds',
      'id, tenant_id, payment_id, amount_minor, status, reason, created_at',
    ),
  });
  const {
    tenantSlug: tenantSlugs,
    companies,
    serviceCases,
    renewals,
    documentRequests,
    documentHeads,
    documentVersions,
    invoices,
    payments,
    refunds,
  } = settled.data;
  const documents = associateCurrentDocumentVersions(documentHeads, documentVersions, tenantId);

  return calculateProDashboard(
    {
      tenantId,
      assignedCompanyId,
      tenantSlug: tenantSlugs[0],
      days,
      companies,
      serviceCases,
      renewals,
      documentRequests,
      documents,
      invoices,
      payments,
      refunds,
      errors: settled.errors,
      filters,
    },
    new Date(),
  );
}
