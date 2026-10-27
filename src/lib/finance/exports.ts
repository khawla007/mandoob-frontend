import { dubaiMonthRange } from './reports';

export type FinanceExportKind =
  | 'invoice'
  | 'payment'
  | 'refund'
  | 'credit_note'
  | 'expense'
  | 'compensation';
export type FinanceExportFilters = {
  start: string;
  end: string;
  currency: string | null;
  kind: FinanceExportKind | null;
  limit: number;
};
export type FinanceExportRow = {
  occurredAt: string;
  kind: FinanceExportKind;
  reference: string;
  amountMinor: number;
  currency: string;
};
export type FinanceExportScope = {
  actorId: string;
  tenantId: string | null;
  companyId: string | null;
  operationId: string | null;
};

const KINDS = new Set<FinanceExportKind>([
  'invoice',
  'payment',
  'refund',
  'credit_note',
  'expense',
  'compensation',
]);

export function parseFinanceExportFilters(url: URL): FinanceExportFilters | null {
  const allowed = new Set(['month', 'currency', 'kind', 'limit', 'operationId']);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return null;
  if (url.searchParams.getAll('month').length !== 1) return null;
  for (const key of ['currency', 'kind', 'limit', 'operationId']) {
    if (url.searchParams.getAll(key).length > 1) return null;
  }
  const range = dubaiMonthRange(url.searchParams.get('month') ?? '');
  const currency = url.searchParams.get('currency');
  const kind = url.searchParams.get('kind');
  const rawLimit = url.searchParams.get('limit') ?? '10000';
  if (
    !range ||
    (currency !== null && !/^[A-Z]{3}$/u.test(currency)) ||
    (kind !== null && !KINDS.has(kind as FinanceExportKind)) ||
    !/^\d+$/u.test(rawLimit)
  ) {
    return null;
  }
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) return null;
  return { ...range, currency, kind: kind as FinanceExportKind | null, limit };
}

export function financeRowsToCsv(rows: FinanceExportRow[]): string {
  const header = 'occurred_at,kind,reference,amount_minor,currency';
  return [
    header,
    ...rows.map((row) =>
      [row.occurredAt, row.kind, row.reference, row.amountMinor, row.currency]
        .map(csvCell)
        .join(','),
    ),
  ].join('\r\n');
}

export async function exportFinanceCsv(
  filters: FinanceExportFilters,
  scope: FinanceExportScope,
): Promise<string> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  const rows: FinanceExportRow[] = [];
  let cursor: { occurredAt: string; id: string } | null = null;
  while (rows.length < filters.limit) {
    const pageLimit = Math.min(1000, filters.limit - rows.length);
    const { data, error } = await admin.rpc(
      'p309_export_finance_page' as never,
      {
        p_actor_id: scope.actorId,
        p_tenant_id: scope.tenantId,
        p_company_id: scope.companyId,
        p_start_at: filters.start,
        p_end_at: filters.end,
        p_operation_id: scope.operationId,
        p_currency: filters.currency,
        p_kind: filters.kind,
        p_before_accounting_at: cursor?.occurredAt ?? null,
        p_before_id: cursor?.id ?? null,
        p_limit: pageLimit,
      } as never,
    );
    if (error || !data || typeof data !== 'object') throw new Error('FINANCE_EXPORT_UNAVAILABLE');
    const payload = data as unknown as {
      rows?: Array<Record<string, unknown>>;
      nextCursor?: { occurredAt?: unknown; id?: unknown } | null;
    };
    const pageRows = (payload.rows ?? []).map(parseExportRow);
    if (pageRows.some((row) => row === null)) throw new Error('FINANCE_EXPORT_UNAVAILABLE');
    rows.push(...(pageRows as FinanceExportRow[]));
    const next = payload.nextCursor;
    cursor =
      next && typeof next.occurredAt === 'string' && typeof next.id === 'string'
        ? { occurredAt: next.occurredAt, id: next.id }
        : null;
    if (!cursor || pageRows.length === 0) break;
  }
  return financeRowsToCsv(rows);
}

function parseExportRow(row: Record<string, unknown>): FinanceExportRow | null {
  if (
    typeof row.occurredAt !== 'string' ||
    !KINDS.has(row.kind as FinanceExportKind) ||
    typeof row.reference !== 'string' ||
    !Number.isSafeInteger(row.amountMinor) ||
    typeof row.currency !== 'string' ||
    !/^[A-Z]{3}$/u.test(row.currency)
  ) {
    return null;
  }
  return row as unknown as FinanceExportRow;
}

function csvCell(value: string | number): string {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : '0';
  let safe = value.replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();
  if (/^[=+\-@]/u.test(safe)) safe = `'${safe}`;
  return /[",]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe;
}
