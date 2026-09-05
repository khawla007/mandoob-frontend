import 'server-only';

import { z } from 'zod';

import {
  authorizeCustomerLinkedCompanyRead,
  type CustomerCompanyAccess,
} from '@/lib/data/customer-company-access';
import { addSignalDays, signalBusinessDate, signalDaysBetween } from '@/lib/data/signal-finance';
import type { RenewalStatus, RenewalType } from '@/lib/data/renewals';

export const CUSTOMER_RENEWAL_PAGE_SIZE = 25;
const ACTIVE_STATUSES: RenewalStatus[] = ['upcoming', 'due_soon', 'overdue'];
export type CustomerRenewalBucket =
  | 'active'
  | 'overdue'
  | 'due-soon'
  | 'upcoming'
  | 'completed'
  | 'cancelled'
  | 'missing-date';

const searchSchema = z.object({
  bucket: z
    .enum(['active', 'overdue', 'due-soon', 'upcoming', 'completed', 'cancelled', 'missing-date'])
    .optional(),
  type: z.enum(['all', 'license', 'visa', 'eid', 'ejari']).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  focus: z.string().uuid().optional(),
});
export type CustomerRenewalSearch = {
  bucket: CustomerRenewalBucket;
  type: 'all' | RenewalType;
  q: string;
  page: number;
  focus: string | null;
};
export type CustomerRenewalDbRow = {
  id: string;
  tenant_id: string;
  company_id: string;
  type: RenewalType;
  label: string;
  due_date: string | null;
  status: RenewalStatus;
  source: 'license_backfill' | 'manual';
  completed_at: string | null;
};
export type CustomerRenewalRow = {
  id: string;
  type: RenewalType;
  label: string;
  dueDate: string | null;
  status: RenewalStatus;
  source: CustomerRenewalDbRow['source'];
  completedAt: string | null;
  bucket: Exclude<CustomerRenewalBucket, 'active'>;
  daysOut: number | null;
  href: string;
};
type Scope = { tenantId: string; companyId: string };
type SummaryBucket = 'overdue' | 'due-soon' | 'upcoming' | 'completed';
export type CustomerRenewalStore = {
  list: (
    input: Scope & { search: CustomerRenewalSearch; today: string; from: number; to: number },
  ) => Promise<{
    data: CustomerRenewalDbRow[] | null;
    count: number | null;
    error: unknown | null;
  }>;
  total: (input: Scope) => Promise<{ count: number | null; error: unknown | null }>;
  bucketCount: (
    input: Scope & { bucket: SummaryBucket; today: string },
  ) => Promise<{ count: number | null; error: unknown | null }>;
};
type Summaries = Record<SummaryBucket, number | null>;
type Base = {
  rows: CustomerRenewalRow[];
  total: number;
  unfilteredTotal: number | null;
  page: number;
  pageSize: number;
  canonicalPage: number;
  summaries: Summaries;
  mutations: 'phase-3-unavailable';
};
export type CustomerRenewalResult =
  | (Base & { state: 'ready' | 'empty' | 'no-results' | 'partial' })
  | {
      state: 'error' | 'unlinked' | 'permission';
      rows: [];
      total: null;
      unfilteredTotal: null;
      page: number;
      pageSize: number;
      canonicalPage: number;
      summaries: Summaries;
      mutations: 'phase-3-unavailable';
    };
export type CustomerRenewalDependencies = {
  authorize?: (slug: string) => Promise<CustomerCompanyAccess>;
  store?: CustomerRenewalStore;
  today?: string;
};

export type CustomerRenewalQuery = PromiseLike<unknown> & {
  select: (columns: string, options?: { count: 'exact'; head?: boolean }) => CustomerRenewalQuery;
  eq: (column: string, value: string) => CustomerRenewalQuery;
  in: (column: string, values: string[]) => CustomerRenewalQuery;
  ilike: (column: string, value: string) => CustomerRenewalQuery;
  is: (column: string, value: null) => CustomerRenewalQuery;
  not: (column: string, operator: 'is', value: null) => CustomerRenewalQuery;
  lt: (column: string, value: string) => CustomerRenewalQuery;
  lte: (column: string, value: string) => CustomerRenewalQuery;
  gt: (column: string, value: string) => CustomerRenewalQuery;
  gte: (column: string, value: string) => CustomerRenewalQuery;
  order: (
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ) => CustomerRenewalQuery;
  range: (from: number, to: number) => CustomerRenewalQuery;
};
export type CustomerRenewalClient = { from: (table: 'renewals') => CustomerRenewalQuery };

function first(input: Record<string, string | string[] | undefined>, key: string) {
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}
export function parseCustomerRenewalSearch(
  input: Record<string, string | string[] | undefined>,
): CustomerRenewalSearch {
  const parsed = searchSchema.safeParse({
    bucket: first(input, 'bucket'),
    type: first(input, 'type'),
    q: first(input, 'q'),
    page: first(input, 'page'),
    focus: first(input, 'focus') ?? first(input, 'renewal'),
  });
  const value = parsed.success ? parsed.data : {};
  return {
    bucket: value.bucket ?? 'active',
    type: value.type ?? 'all',
    q: value.q ?? '',
    page: value.page ?? 1,
    focus: value.focus ?? null,
  };
}
export function customerRenewalHref(
  slug: string,
  search: CustomerRenewalSearch,
  page = search.page,
) {
  const query = new URLSearchParams();
  if (search.bucket !== 'active') query.set('bucket', search.bucket);
  if (search.type !== 'all') query.set('type', search.type);
  if (search.q) query.set('q', search.q);
  if (search.focus) query.set('focus', search.focus);
  if (page > 1 && !search.focus) query.set('page', String(page));
  const suffix = query.toString();
  return `/t/${encodeURIComponent(slug)}/portal/renewals${suffix ? `?${suffix}` : ''}`;
}
export function classifyCustomerRenewalBucket(
  dueDate: string | null,
  status: RenewalStatus,
  today = signalBusinessDate(),
): Exclude<CustomerRenewalBucket, 'active'> {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (!isStrictDate(dueDate)) return 'missing-date';
  const days = signalDaysBetween(today, dueDate);
  if (days < 0) return 'overdue';
  return days <= 30 ? 'due-soon' : 'upcoming';
}

function isStrictDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export async function listCustomerRenewals(
  input: { tenantSlug: string; search: CustomerRenewalSearch },
  dependencies: CustomerRenewalDependencies = {},
): Promise<CustomerRenewalResult> {
  const access = await (dependencies.authorize ?? authorizeCustomerLinkedCompanyRead)(
    input.tenantSlug,
  );
  const unavailableSummaries: Summaries = {
    overdue: null,
    'due-soon': null,
    upcoming: null,
    completed: null,
  };
  const page = input.search.focus ? 1 : input.search.page;
  const unavailable = {
    rows: [] as [],
    total: null,
    unfilteredTotal: null,
    page,
    pageSize: CUSTOMER_RENEWAL_PAGE_SIZE,
    canonicalPage: page,
    summaries: unavailableSummaries,
    mutations: 'phase-3-unavailable' as const,
  };
  if (access.kind === 'unlinked') return { ...unavailable, state: 'unlinked' };
  if (access.kind !== 'authorized') return { ...unavailable, state: 'permission' };
  const scope = { tenantId: access.tenant.id, companyId: access.company.id };
  const today = dependencies.today ?? signalBusinessDate();
  const store = dependencies.store ?? createCustomerRenewalSupabaseStore(await serviceClient());
  const from = (page - 1) * CUSTOMER_RENEWAL_PAGE_SIZE;
  const buckets: SummaryBucket[] = ['overdue', 'due-soon', 'upcoming', 'completed'];
  const [listed, total, ...summaryResults] = await Promise.all([
    store
      .list({
        ...scope,
        search: input.search,
        today,
        from,
        to: from + CUSTOMER_RENEWAL_PAGE_SIZE - 1,
      })
      .catch(() => ({ data: null, count: null, error: 'sanitized' })),
    store.total(scope).catch(() => ({ count: null, error: 'sanitized' })),
    ...buckets.map((bucket) =>
      store
        .bucketCount({ ...scope, bucket, today })
        .catch(() => ({ count: null, error: 'sanitized' })),
    ),
  ]);
  const summaries = Object.fromEntries(
    buckets.map((bucket, index) => {
      const result = summaryResults[index];
      return [bucket, result?.error || result?.count === null ? null : (result?.count ?? null)];
    }),
  ) as Summaries;
  if (listed.error || listed.count === null) return { ...unavailable, summaries, state: 'error' };
  if (
    (listed.data ?? []).some(
      (row) => row.tenant_id !== scope.tenantId || row.company_id !== scope.companyId,
    )
  ) {
    return { ...unavailable, summaries, state: 'error' };
  }
  const rows = (listed.data ?? []).map((row) => {
    const dueDate = isStrictDate(row.due_date) ? row.due_date : null;
    return {
      id: row.id,
      type: row.type,
      label: row.label,
      dueDate,
      status: row.status,
      source: row.source,
      completedAt: row.completed_at,
      bucket: classifyCustomerRenewalBucket(dueDate, row.status, today),
      daysOut: dueDate ? signalDaysBetween(today, dueDate) : null,
      href: customerRenewalHref(access.tenant.slug, {
        bucket: input.search.bucket,
        type: input.search.type,
        q: input.search.q,
        page: 1,
        focus: row.id,
      }),
    };
  });
  const canonicalPage = Math.min(
    page,
    Math.max(1, Math.ceil(listed.count / CUSTOMER_RENEWAL_PAGE_SIZE)),
  );
  const base: Base = {
    rows,
    total: listed.count,
    unfilteredTotal: total.error || total.count === null ? null : total.count,
    page,
    pageSize: CUSTOMER_RENEWAL_PAGE_SIZE,
    canonicalPage,
    summaries,
    mutations: 'phase-3-unavailable',
  };
  if (
    total.error ||
    total.count === null ||
    Object.values(summaries).some((value) => value === null)
  )
    return { ...base, state: 'partial' };
  if (listed.count === 0) return { ...base, state: total.count === 0 ? 'empty' : 'no-results' };
  return { ...base, state: 'ready' };
}

async function serviceClient() {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient() as unknown as CustomerRenewalClient;
}

export function createCustomerRenewalSupabaseStore(
  client: CustomerRenewalClient,
): CustomerRenewalStore {
  const scope = (query: CustomerRenewalQuery, input: Scope) =>
    query.eq('tenant_id', input.tenantId).eq('company_id', input.companyId);
  const applyBucket = (
    query: CustomerRenewalQuery,
    bucket: CustomerRenewalBucket,
    today: string,
  ) => {
    if (bucket === 'completed' || bucket === 'cancelled') return query.eq('status', bucket);
    let active = query.in('status', ACTIVE_STATUSES);
    if (bucket === 'overdue') active = active.lt('due_date', today);
    if (bucket === 'due-soon')
      active = active.gte('due_date', today).lte('due_date', addSignalDays(today, 30));
    if (bucket === 'upcoming') active = active.gt('due_date', addSignalDays(today, 30));
    if (bucket === 'missing-date') active = active.is('due_date', null);
    return active;
  };
  return {
    list: async ({ tenantId, companyId, search, today, from, to }) => {
      let query = applyBucket(
        scope(
          client
            .from('renewals')
            .select(
              'id, tenant_id, company_id, type, label, due_date, status, source, completed_at',
              { count: 'exact' },
            ),
          { tenantId, companyId },
        ),
        search.bucket,
        today,
      );
      if (search.type !== 'all') query = query.eq('type', search.type);
      if (search.q)
        query = query.ilike('label', `%${search.q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
      if (search.focus) query = query.eq('id', search.focus);
      return (await query
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, to)) as unknown as {
        data: CustomerRenewalDbRow[] | null;
        count: number | null;
        error: unknown | null;
      };
    },
    total: async (input) =>
      (await scope(
        client.from('renewals').select('id', { count: 'exact', head: true }),
        input,
      )) as unknown as { count: number | null; error: unknown | null },
    bucketCount: async ({ tenantId, companyId, bucket, today }) =>
      (await applyBucket(
        scope(client.from('renewals').select('id', { count: 'exact', head: true }), {
          tenantId,
          companyId,
        }),
        bucket,
        today,
      )) as unknown as { count: number | null; error: unknown | null },
  };
}
