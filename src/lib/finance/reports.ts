export type ReportPeriod = { start: string; end: string };
export type ReportScope = {
  scopeKind: 'client' | 'company' | 'platform';
  scopeId: string;
};
export type LedgerReportRow = {
  journalId: string;
  sourceId: string;
  sourceKind:
    | 'invoice'
    | 'subscription_invoice'
    | 'invoice_void'
    | 'payment_allocation'
    | 'cash_refund'
    | 'credit_note'
    | 'expense'
    | 'expense_reversal'
    | 'compensation'
    | 'compensation_reversal';
  currency: string;
  accountCode:
    | 'receivable'
    | 'cash_clearing'
    | 'bank_clearing'
    | 'subscription_revenue'
    | 'service_revenue'
    | 'government_revenue'
    | 'vat_payable'
    | 'refund_contra_revenue'
    | 'expense'
    | 'pro_compensation_payable';
  debitMinor: number;
  creditMinor: number;
  accountingAt: string;
  currentInvoiceStatus: string | null;
  scopeKind: ReportScope['scopeKind'];
  scopeId: string;
};

export type CurrencyReport = {
  cashCollectedMinor: number;
  billedMinor: number;
  receivableMinor: number;
  revenueMinor: number;
  expenseMinor: number;
  profitMinor: number;
};

const MONEY_LIMIT = 100_000_000_000;

export function dubaiMonthRange(month: string): ReportPeriod | null {
  const match = /^(\d{4})-(\d{2})$/u.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (year < 1970 || monthIndex < 0 || monthIndex > 11) return null;
  const start = new Date(Date.UTC(year, monthIndex, 1, -4));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, -4));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function dubaiMonthKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('DUBAI_MONTH_UNAVAILABLE');
  return `${year}-${month}`;
}

export async function loadFinanceReport(input: {
  actorId: string;
  tenantId: string | null;
  companyId: string | null;
  customerProfileId?: string | null;
  period: ReportPeriod;
}): Promise<{ period: ReportPeriod; currencies: Record<string, CurrencyReport> }> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const { data, error } = await createSupabaseServiceRoleClient().rpc(
    'p309_finance_report' as never,
    {
      p_actor_id: input.actorId,
      p_tenant_id: input.tenantId,
      p_company_id: input.companyId,
      p_customer_profile_id: input.customerProfileId ?? null,
      p_start_at: input.period.start,
      p_end_at: input.period.end,
    } as never,
  );
  if (error || !data || typeof data !== 'object') throw new Error('FINANCE_REPORT_UNAVAILABLE');
  const payload = data as unknown as { currencies?: unknown };
  return { period: input.period, currencies: parseCurrencyReports(payload.currencies) };
}

export async function loadSubscriptionReport(
  actorId: string,
  period: ReportPeriod,
): Promise<{
  currencies: Record<string, SubscriptionMetrics>;
  churnRate: { numerator: number; denominator: number } | null;
}> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const { data, error } = await createSupabaseServiceRoleClient().rpc(
    'p309_subscription_report' as never,
    { p_actor_id: actorId, p_start_at: period.start, p_end_at: period.end } as never,
  );
  if (error || !data || typeof data !== 'object')
    throw new Error('SUBSCRIPTION_REPORT_UNAVAILABLE');
  const payload = data as unknown as { currencies?: unknown; churn?: unknown };
  const currencies = parseSubscriptionReports(payload.currencies);
  const churn = payload.churn as { numerator?: unknown; denominator?: unknown } | null;
  return {
    currencies,
    churnRate:
      churn && Number.isSafeInteger(churn.numerator) && Number.isSafeInteger(churn.denominator)
        ? { numerator: churn.numerator as number, denominator: churn.denominator as number }
        : null,
  };
}

export function aggregateLedgerReport(
  rows: LedgerReportRow[],
  period: ReportPeriod,
  scope?: ReportScope,
): Record<string, CurrencyReport> {
  const result: Record<string, CurrencyReport> = {};
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return result;

  for (const row of rows) {
    if (scope && (row.scopeKind !== scope.scopeKind || row.scopeId !== scope.scopeId)) continue;
    if (!isSafeRow(row)) continue;
    const at = Date.parse(row.accountingAt);
    if (at >= end) continue;
    const bucket = (result[row.currency] ??= emptyCurrencyReport());
    const movement = row.debitMinor - row.creditMinor;
    if (row.accountCode === 'receivable') bucket.receivableMinor += movement;
    if (at < start) continue;

    if (
      (row.accountCode === 'cash_clearing' || row.accountCode === 'bank_clearing') &&
      (row.sourceKind === 'payment_allocation' || row.sourceKind === 'cash_refund')
    ) {
      bucket.cashCollectedMinor += movement;
    }
    if (
      row.accountCode === 'receivable' &&
      ['invoice', 'subscription_invoice', 'credit_note', 'invoice_void'].includes(row.sourceKind)
    ) {
      bucket.billedMinor += movement;
    }
    if (isRevenueRow(row)) {
      bucket.revenueMinor += row.creditMinor - row.debitMinor;
    }
    if (row.accountCode === 'refund_contra_revenue') {
      bucket.revenueMinor -= row.debitMinor - row.creditMinor;
    }
    if (row.accountCode === 'expense') {
      bucket.expenseMinor += row.debitMinor - row.creditMinor;
    }
  }
  for (const bucket of Object.values(result)) {
    bucket.profitMinor = bucket.revenueMinor - bucket.expenseMinor;
  }
  return result;
}

export type ActiveSubscription = {
  id: string;
  currency: string;
  interval: 'month' | 'year';
  amountMinor: number;
};

export type SubscriptionMetrics = {
  activePaidCount: number;
  mrrMinor: number;
  mrrAnnualRemainderMinor: number;
  arrNumeratorMinor: number;
  churnRate: { numerator: number; denominator: number } | null;
  arpuMinor: number | null;
  arpuRemainder: number;
  arpuDenominator: number;
};

export function calculateSubscriptionMetrics(
  active: ActiveSubscription[],
  canceledNotReactivated: number,
  activeAtStart: number,
): SubscriptionMetrics {
  if (
    active.some((row) => !/^[A-Z]{3}$/u.test(row.currency) || !isMoney(row.amountMinor) || !row.id)
  ) {
    throw new Error('INVALID_SUBSCRIPTION');
  }
  const currencies = new Set(active.map((row) => row.currency));
  if (currencies.size > 1) throw new Error('MIXED_CURRENCIES');
  const monthlyMinor = active
    .filter((row) => row.interval === 'month' && isMoney(row.amountMinor))
    .reduce((sum, row) => sum + row.amountMinor, 0);
  const annualMinor = active
    .filter((row) => row.interval === 'year' && isMoney(row.amountMinor))
    .reduce((sum, row) => sum + row.amountMinor, 0);
  const numerator = 12 * monthlyMinor + annualMinor;
  const arpuDenominator = 12 * active.length;
  return {
    activePaidCount: active.length,
    mrrMinor: Math.floor(numerator / 12),
    mrrAnnualRemainderMinor: numerator % 12,
    arrNumeratorMinor: numerator,
    churnRate:
      activeAtStart === 0
        ? null
        : { numerator: canceledNotReactivated, denominator: activeAtStart },
    arpuMinor: arpuDenominator === 0 ? null : Math.floor(numerator / arpuDenominator),
    arpuRemainder: arpuDenominator === 0 ? 0 : numerator % arpuDenominator,
    arpuDenominator,
  };
}

export function paginateStable<T extends { occurredAt: string; id: string }>(
  input: T[],
  cursor: { occurredAt: string; id: string } | null,
  requestedLimit: number,
): { rows: T[]; nextCursor: { occurredAt: string; id: string } | null } {
  const limit = Math.min(1000, Math.max(1, Math.trunc(requestedLimit)));
  const rows = [...input]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
    .filter(
      (row) =>
        !cursor ||
        row.occurredAt < cursor.occurredAt ||
        (row.occurredAt === cursor.occurredAt && row.id < cursor.id),
    )
    .slice(0, limit);
  const last = rows.at(-1);
  return {
    rows,
    nextCursor: rows.length === limit && last ? { occurredAt: last.occurredAt, id: last.id } : null,
  };
}

function emptyCurrencyReport(): CurrencyReport {
  return {
    cashCollectedMinor: 0,
    billedMinor: 0,
    receivableMinor: 0,
    revenueMinor: 0,
    expenseMinor: 0,
    profitMinor: 0,
  };
}

function isRevenueRow(row: LedgerReportRow): boolean {
  return (
    row.accountCode === 'service_revenue' ||
    row.accountCode === 'government_revenue' ||
    (row.accountCode === 'subscription_revenue' && row.sourceKind === 'subscription_invoice')
  );
}

function isMoney(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= MONEY_LIMIT;
}

function isSafeRow(row: LedgerReportRow): boolean {
  return /^[A-Z]{3}$/u.test(row.currency) && isMoney(row.debitMinor) && isMoney(row.creditMinor);
}

function parseCurrencyReports(value: unknown): Record<string, CurrencyReport> {
  if (!value || typeof value !== 'object') return {};
  const output: Record<string, CurrencyReport> = {};
  for (const [currency, raw] of Object.entries(value)) {
    if (!/^[A-Z]{3}$/u.test(currency) || !raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const keys: Array<keyof CurrencyReport> = [
      'cashCollectedMinor',
      'billedMinor',
      'receivableMinor',
      'revenueMinor',
      'expenseMinor',
      'profitMinor',
    ];
    if (keys.every((key) => Number.isSafeInteger(row[key]))) {
      output[currency] = Object.fromEntries(keys.map((key) => [key, row[key]])) as CurrencyReport;
    }
  }
  return output;
}

function parseSubscriptionReports(value: unknown): Record<string, SubscriptionMetrics> {
  if (!value || typeof value !== 'object') return {};
  const output: Record<string, SubscriptionMetrics> = {};
  for (const [currency, raw] of Object.entries(value)) {
    if (!/^[A-Z]{3}$/u.test(currency) || !raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const integers = [
      row.activePaidCount,
      row.mrrMinor,
      row.mrrAnnualRemainderMinor,
      row.arrNumeratorMinor,
      row.arpuRemainder,
      row.arpuDenominator,
    ];
    if (!integers.every((item) => Number.isSafeInteger(item) && (item as number) >= 0)) continue;
    if (
      row.arpuMinor !== null &&
      (!Number.isSafeInteger(row.arpuMinor) || (row.arpuMinor as number) < 0)
    )
      continue;
    const churn = parseRate(row.churnRate);
    if (row.churnRate !== null && !churn) continue;
    output[currency] = { ...(row as unknown as SubscriptionMetrics), churnRate: churn };
  }
  return output;
}

function parseRate(value: unknown): { numerator: number; denominator: number } | null {
  if (value === null || !value || typeof value !== 'object') return null;
  const rate = value as Record<string, unknown>;
  return Number.isSafeInteger(rate.numerator) &&
    Number.isSafeInteger(rate.denominator) &&
    (rate.numerator as number) >= 0 &&
    (rate.denominator as number) > 0 &&
    (rate.numerator as number) <= (rate.denominator as number)
    ? { numerator: rate.numerator as number, denominator: rate.denominator as number }
    : null;
}
