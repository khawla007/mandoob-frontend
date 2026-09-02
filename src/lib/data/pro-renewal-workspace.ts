import 'server-only';

import { z } from 'zod';

import type { RenewalRow, RenewalStatus, RenewalType } from '@/lib/data/renewals';
import { addSignalDays, signalBusinessDate, signalDaysBetween } from '@/lib/data/signal-finance';

export const RENEWAL_WORKSPACE_PAGE_SIZE = 25;

const activeStatuses = ['upcoming', 'due_soon', 'overdue'] as const satisfies RenewalStatus[];
const renewalWorkspaceSearchSchema = z.object({
  tab: z.enum(['active', 'completed', 'cancelled']).optional(),
  type: z.enum(['all', 'license', 'visa', 'eid', 'ejari']).optional(),
  status: z.enum(['all', 'upcoming', 'due_soon', 'overdue']).optional(),
  urgency: z.enum(['all', 'overdue', 'today', '7', '30', '60', '90', 'future']).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  focus: z.string().uuid().optional(),
});

export type RenewalWorkspaceSearch = {
  tab: 'active' | 'completed' | 'cancelled';
  type: 'all' | RenewalType;
  status: 'all' | (typeof activeStatuses)[number];
  urgency: 'all' | 'overdue' | 'today' | '7' | '30' | '60' | '90' | 'future';
  q: string;
  page: number;
  focus: string | null;
};

export type RenewalUrgency =
  | Exclude<RenewalWorkspaceSearch['urgency'], 'all'>
  | 'completed'
  | 'cancelled';
export type RenewalWorkspaceAccess = { tenantId: string; companyId: string };
export type RenewalWorkspaceDbRow = {
  id: string;
  tenant_id: string;
  company_id: string;
  type: RenewalType;
  label: string;
  due_date: string;
  status: RenewalStatus;
  source: 'license_backfill' | 'manual';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RenewalWorkspaceStore = {
  list: (
    input: RenewalWorkspaceAccess & {
      search: RenewalWorkspaceSearch;
      from: number;
      to: number;
      today: string;
    },
  ) => Promise<{
    data: RenewalWorkspaceDbRow[] | null;
    count: number | null;
    error: unknown | null;
  }>;
  total: (
    input: RenewalWorkspaceAccess,
  ) => Promise<{ count: number | null; error: unknown | null }>;
};

type WorkspaceBase = {
  rows: RenewalRow[];
  total: number;
  unfilteredTotal: number | null;
  page: number;
  pageSize: number;
  canonicalPage: number;
  phase3Unavailable: true;
};

export type RenewalWorkspaceResult =
  | (WorkspaceBase & { state: 'data' | 'empty' | 'no_results' | 'partial' })
  | {
      state: 'unavailable';
      rows: [];
      total: 0;
      unfilteredTotal: null;
      page: number;
      pageSize: number;
      canonicalPage: number;
      phase3Unavailable: true;
      error: 'sanitized';
    };

export type RenewalWorkspaceDependencies = {
  authorize?: (input: {
    actorProfileId: string;
    tenantSlug: string;
  }) => Promise<RenewalWorkspaceAccess>;
  store?: RenewalWorkspaceStore;
  today?: string;
};

export function parseRenewalWorkspaceSearch(
  input: Record<string, string | string[] | undefined>,
): RenewalWorkspaceSearch {
  const first = (key: string) => {
    const value = input[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const parsed = renewalWorkspaceSearchSchema.safeParse({
    tab: first('tab'),
    type: first('type'),
    status: first('status'),
    urgency: first('urgency'),
    q: first('q'),
    page: first('page'),
    focus: first('focus') ?? first('target'),
  });
  const value = parsed.success ? parsed.data : {};
  const tab = value.tab ?? 'active';
  return {
    tab,
    type: value.type ?? 'all',
    status: tab === 'active' ? (value.status ?? 'all') : 'all',
    urgency: value.urgency ?? 'all',
    q: value.q ?? '',
    page: value.page ?? 1,
    focus: value.focus ?? null,
  };
}

export function renewalWorkspaceHref(
  slug: string,
  search: RenewalWorkspaceSearch,
  page = search.page,
): string {
  const query = new URLSearchParams();
  if (search.tab !== 'active') query.set('tab', search.tab);
  if (search.type !== 'all') query.set('type', search.type);
  if (search.status !== 'all' && search.tab === 'active') query.set('status', search.status);
  if (search.urgency !== 'all') query.set('urgency', search.urgency);
  if (search.q) query.set('q', search.q);
  if (search.focus) query.set('focus', search.focus);
  if (page > 1) query.set('page', String(page));
  const suffix = query.toString();
  return `/t/${encodeURIComponent(slug)}/renewals${suffix ? `?${suffix}` : ''}`;
}

export function classifyRenewalUrgency(
  dueDate: string,
  status: RenewalStatus,
  today = signalBusinessDate(),
): RenewalUrgency {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  const days = signalDaysBetween(today, dueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return '7';
  if (days <= 30) return '30';
  if (days <= 60) return '60';
  if (days <= 90) return '90';
  return 'future';
}

function toRenewalRow(row: RenewalWorkspaceDbRow, today: string): RenewalRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    companyId: row.company_id,
    type: row.type,
    label: row.label,
    dueDate: row.due_date,
    daysOut: signalDaysBetween(today, row.due_date),
    status: row.status,
    source: row.source,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The public renewal workspace read resolves active tenant and current Company ownership itself. */
export async function listProRenewalWorkspace(
  input: { actorProfileId: string; tenantSlug: string; search: RenewalWorkspaceSearch },
  dependencies: RenewalWorkspaceDependencies = {},
): Promise<RenewalWorkspaceResult> {
  const access = await (dependencies.authorize ?? authorizeRenewalWorkspaceRead)({
    actorProfileId: input.actorProfileId,
    tenantSlug: input.tenantSlug,
  });
  const today = dependencies.today ?? signalBusinessDate();
  const store = dependencies.store ?? (await createSupabaseRenewalWorkspaceStore());
  const page = input.search.focus ? 1 : input.search.page;
  const from = (page - 1) * RENEWAL_WORKSPACE_PAGE_SIZE;
  const [listed, unfiltered] = await Promise.all([
    store.list({
      ...access,
      search: input.search,
      from,
      to: from + RENEWAL_WORKSPACE_PAGE_SIZE - 1,
      today,
    }),
    store.total(access),
  ]);
  if (listed.error || listed.count === null) {
    return {
      state: 'unavailable',
      rows: [],
      total: 0,
      unfilteredTotal: null,
      page,
      pageSize: RENEWAL_WORKSPACE_PAGE_SIZE,
      canonicalPage: page,
      phase3Unavailable: true,
      error: 'sanitized',
    };
  }
  const pageCount = Math.max(1, Math.ceil(listed.count / RENEWAL_WORKSPACE_PAGE_SIZE));
  const canonicalPage = Math.min(page, pageCount);
  const base: WorkspaceBase = {
    rows: (listed.data ?? [])
      .filter((row) => row.tenant_id === access.tenantId && row.company_id === access.companyId)
      .map((row) => toRenewalRow(row, today)),
    total: listed.count,
    unfilteredTotal: unfiltered.error || unfiltered.count === null ? null : unfiltered.count,
    page,
    pageSize: RENEWAL_WORKSPACE_PAGE_SIZE,
    canonicalPage,
    phase3Unavailable: true,
  };
  if (unfiltered.error || unfiltered.count === null) return { ...base, state: 'partial' };
  if (listed.count === 0)
    return { ...base, state: unfiltered.count === 0 ? 'empty' : 'no_results' };
  return { ...base, state: 'data' };
}

async function authorizeRenewalWorkspaceRead(input: {
  actorProfileId: string;
  tenantSlug: string;
}): Promise<RenewalWorkspaceAccess> {
  const [{ requireProTenantRouteAccess }, { requireActiveTenant }, { readAssignedCompanyForPro }] =
    await Promise.all([
      import('@/lib/auth/require-tenant-route-access'),
      import('@/lib/auth/require-active-tenant'),
      import('@/lib/data/company-profile'),
    ]);
  const { session, tenant } = await requireProTenantRouteAccess(input.tenantSlug);
  if (session.id !== input.actorProfileId) throw new Error('PRO_ACTOR_MISMATCH');
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, input.tenantSlug);
  if (!company || company.tenantId !== tenant.id) throw new Error('ASSIGNED_COMPANY_MISMATCH');
  return { tenantId: tenant.id, companyId: company.id };
}

type RenewalWorkspaceQuery = PromiseLike<unknown> & {
  select: (columns: string, options?: { count: 'exact'; head?: boolean }) => RenewalWorkspaceQuery;
  eq: (column: string, value: string) => RenewalWorkspaceQuery;
  in: (column: string, values: string[]) => RenewalWorkspaceQuery;
  ilike: (column: string, value: string) => RenewalWorkspaceQuery;
  lte: (column: string, value: string) => RenewalWorkspaceQuery;
  gte: (column: string, value: string) => RenewalWorkspaceQuery;
  lt: (column: string, value: string) => RenewalWorkspaceQuery;
  gt: (column: string, value: string) => RenewalWorkspaceQuery;
  order: (column: string, options: { ascending: boolean }) => RenewalWorkspaceQuery;
  range: (from: number, to: number) => RenewalWorkspaceQuery;
};
type RenewalWorkspaceClient = { from: (table: 'renewals') => RenewalWorkspaceQuery };
const columns =
  'id, tenant_id, company_id, type, label, due_date, status, source, completed_at, created_at, updated_at';

export async function createSupabaseRenewalWorkspaceStore(): Promise<RenewalWorkspaceStore> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createRenewalWorkspaceSupabaseStore(
    createSupabaseServiceRoleClient() as unknown as RenewalWorkspaceClient,
  );
}

export function createRenewalWorkspaceSupabaseStore(
  client: RenewalWorkspaceClient,
): RenewalWorkspaceStore {
  const apply = (
    query: RenewalWorkspaceQuery,
    access: RenewalWorkspaceAccess,
    search: RenewalWorkspaceSearch,
    today: string,
  ) => {
    let scoped = query.eq('tenant_id', access.tenantId).eq('company_id', access.companyId);
    if (search.focus) return scoped.eq('id', search.focus);
    scoped = scoped.in('status', search.tab === 'active' ? [...activeStatuses] : [search.tab]);
    if (search.status !== 'all' && search.tab === 'active')
      scoped = scoped.eq('status', search.status);
    if (search.type !== 'all') scoped = scoped.eq('type', search.type);
    if (search.q)
      scoped = scoped.ilike('label', `%${search.q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
    if (search.urgency === 'overdue') scoped = scoped.lt('due_date', today);
    if (search.urgency === 'today') scoped = scoped.eq('due_date', today);
    if (search.urgency === '7')
      scoped = scoped.gt('due_date', today).lte('due_date', addSignalDays(today, 7));
    if (search.urgency === '30')
      scoped = scoped
        .gt('due_date', addSignalDays(today, 7))
        .lte('due_date', addSignalDays(today, 30));
    if (search.urgency === '60')
      scoped = scoped
        .gt('due_date', addSignalDays(today, 30))
        .lte('due_date', addSignalDays(today, 60));
    if (search.urgency === '90')
      scoped = scoped
        .gt('due_date', addSignalDays(today, 60))
        .lte('due_date', addSignalDays(today, 90));
    if (search.urgency === 'future') scoped = scoped.gt('due_date', addSignalDays(today, 90));
    return scoped;
  };
  return {
    list: async ({ tenantId, companyId, search, from, to, today }) => {
      const result = apply(
        client.from('renewals').select(columns, { count: 'exact' }),
        { tenantId, companyId },
        search,
        today,
      )
        .order('due_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      return result as unknown as Promise<{
        data: RenewalWorkspaceDbRow[] | null;
        count: number | null;
        error: unknown | null;
      }>;
    },
    total: async ({ tenantId, companyId }) => {
      const result = client
        .from('renewals')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId);
      return result as unknown as Promise<{ count: number | null; error: unknown | null }>;
    },
  };
}
