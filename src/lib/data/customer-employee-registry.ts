import 'server-only';

import { z } from 'zod';

import {
  authorizeCustomerLinkedCompanyRead,
  type CustomerCompanyAccess,
} from '@/lib/data/customer-company-access';
import { addSignalDays, signalBusinessDate, signalDaysBetween } from '@/lib/data/signal-finance';

export const CUSTOMER_EMPLOYEE_PAGE_SIZE = 25;

const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'inactive', 'terminated']).optional(),
  expiry: z.enum(['all', 'attention', 'missing']).optional(),
  sort: z.enum(['name', 'visa_expiry', 'eid_expiry']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});

export type CustomerEmployeeSearch = {
  q: string;
  status: 'all' | 'active' | 'inactive' | 'terminated';
  expiry: 'all' | 'attention' | 'missing';
  sort: 'name' | 'visa_expiry' | 'eid_expiry';
  direction: 'asc' | 'desc';
  page: number;
};

export type CustomerEmployeeRow = {
  id: string;
  name: string;
  nationality: string | null;
  status: 'active' | 'inactive' | 'terminated';
  visaExpiry: string | null;
  eidExpiry: string | null;
  visaState: 'missing' | 'expired' | 'attention' | 'current';
  eidState: 'missing' | 'expired' | 'attention' | 'current';
  identifiers: 'unavailable';
};

type EmployeeDbRow = {
  id: string;
  tenant_id: string;
  company_id: string;
  name: string;
  nationality: string | null;
  status: 'active' | 'inactive' | 'terminated';
  visa_expiry: string | null;
  eid_expiry: string | null;
};

type Scope = { tenantId: string; companyId: string };
export type CustomerEmployeeRegistryStore = {
  list: (
    input: Scope & { search: CustomerEmployeeSearch; from: number; to: number },
  ) => Promise<{ data: EmployeeDbRow[] | null; count: number | null; error: unknown | null }>;
  total: (input: Scope) => Promise<{ count: number | null; error: unknown | null }>;
};

type BaseResult = {
  rows: CustomerEmployeeRow[];
  total: number;
  unfilteredTotal: number | null;
  page: number;
  pageSize: number;
  canonicalPage: number;
  mutations: 'phase-3-unavailable';
};
export type CustomerEmployeeRegistryResult =
  | (BaseResult & { state: 'ready' | 'empty' | 'no-results' | 'partial' })
  | {
      state: 'error' | 'unlinked' | 'permission';
      rows: [];
      total: null;
      unfilteredTotal: null;
      page: number;
      pageSize: number;
      canonicalPage: number;
      mutations: 'phase-3-unavailable';
    };

export type CustomerEmployeeRegistryDependencies = {
  authorize?: (slug: string) => Promise<CustomerCompanyAccess>;
  store?: CustomerEmployeeRegistryStore;
  today?: string;
};

export type CustomerEmployeeRegistryQuery = PromiseLike<unknown> & {
  select: (
    columns: string,
    options?: { count: 'exact'; head?: boolean },
  ) => CustomerEmployeeRegistryQuery;
  eq: (column: string, value: string) => CustomerEmployeeRegistryQuery;
  is: (column: string, value: null) => CustomerEmployeeRegistryQuery;
  not: (column: string, operator: 'is', value: null) => CustomerEmployeeRegistryQuery;
  or: (filter: string) => CustomerEmployeeRegistryQuery;
  order: (
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ) => CustomerEmployeeRegistryQuery;
  range: (from: number, to: number) => CustomerEmployeeRegistryQuery;
};
export type CustomerEmployeeRegistryClient = {
  from: (table: 'employees') => CustomerEmployeeRegistryQuery;
};

function first(input: Record<string, string | string[] | undefined>, key: string) {
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parseCustomerEmployeeRegistrySearch(
  input: Record<string, string | string[] | undefined>,
): CustomerEmployeeSearch {
  const parsed = searchSchema.safeParse({
    q: first(input, 'q'),
    status: first(input, 'status'),
    expiry: first(input, 'expiry'),
    sort: first(input, 'sort'),
    direction: first(input, 'direction'),
    page: first(input, 'page'),
  });
  const value = parsed.success ? parsed.data : {};
  return {
    q: value.q ?? '',
    status: value.status ?? 'all',
    expiry: value.expiry ?? 'all',
    sort: value.sort ?? 'name',
    direction: value.direction ?? 'asc',
    page: value.page ?? 1,
  };
}

export function customerEmployeeRegistryHref(
  slug: string,
  search: CustomerEmployeeSearch,
  page = search.page,
) {
  const query = new URLSearchParams();
  if (search.q) query.set('q', search.q);
  if (search.status !== 'all') query.set('status', search.status);
  if (search.expiry !== 'all') query.set('expiry', search.expiry);
  if (search.sort !== 'name') query.set('sort', search.sort);
  if (search.direction !== 'asc') query.set('direction', search.direction);
  if (page > 1) query.set('page', String(page));
  const suffix = query.toString();
  return `/t/${encodeURIComponent(slug)}/portal/employees${suffix ? `?${suffix}` : ''}`;
}

export async function listCustomerEmployeeRegistry(
  input: { tenantSlug: string; search: CustomerEmployeeSearch },
  dependencies: CustomerEmployeeRegistryDependencies = {},
): Promise<CustomerEmployeeRegistryResult> {
  const access = await (dependencies.authorize ?? authorizeCustomerLinkedCompanyRead)(
    input.tenantSlug,
  );
  const unavailableBase = {
    rows: [] as [],
    total: null,
    unfilteredTotal: null,
    page: input.search.page,
    pageSize: CUSTOMER_EMPLOYEE_PAGE_SIZE,
    canonicalPage: input.search.page,
    mutations: 'phase-3-unavailable' as const,
  };
  if (access.kind === 'unlinked') return { ...unavailableBase, state: 'unlinked' };
  if (access.kind !== 'authorized') return { ...unavailableBase, state: 'permission' };

  const today = dependencies.today ?? signalBusinessDate();
  const store =
    dependencies.store ?? createCustomerEmployeeRegistrySupabaseStore(await serviceClient(), today);
  const from = (input.search.page - 1) * CUSTOMER_EMPLOYEE_PAGE_SIZE;
  const [listed, total] = await Promise.all([
    store
      .list({
        tenantId: access.tenant.id,
        companyId: access.company.id,
        search: input.search,
        from,
        to: from + CUSTOMER_EMPLOYEE_PAGE_SIZE - 1,
      })
      .catch(() => ({ data: null, count: null, error: 'sanitized' })),
    store
      .total({ tenantId: access.tenant.id, companyId: access.company.id })
      .catch(() => ({ count: null, error: 'sanitized' })),
  ]);
  if (listed.error || listed.count === null) return { ...unavailableBase, state: 'error' };
  if (
    (listed.data ?? []).some(
      (row) => row.tenant_id !== access.tenant.id || row.company_id !== access.company.id,
    )
  ) {
    return { ...unavailableBase, state: 'error' };
  }
  const rows = (listed.data ?? []).map((row) => {
    const visaExpiry = isStrictDate(row.visa_expiry) ? row.visa_expiry : null;
    const eidExpiry = isStrictDate(row.eid_expiry) ? row.eid_expiry : null;
    return {
      id: row.id,
      name: row.name,
      nationality: row.nationality,
      status: row.status,
      visaExpiry,
      eidExpiry,
      visaState: expiryState(visaExpiry, today),
      eidState: expiryState(eidExpiry, today),
      identifiers: 'unavailable' as const,
    };
  });
  const canonicalPage = Math.min(
    input.search.page,
    Math.max(1, Math.ceil(listed.count / CUSTOMER_EMPLOYEE_PAGE_SIZE)),
  );
  const base: BaseResult = {
    rows,
    total: listed.count,
    unfilteredTotal: total.error || total.count === null ? null : total.count,
    page: input.search.page,
    pageSize: CUSTOMER_EMPLOYEE_PAGE_SIZE,
    canonicalPage,
    mutations: 'phase-3-unavailable',
  };
  if (total.error || total.count === null) return { ...base, state: 'partial' };
  if (listed.count === 0) return { ...base, state: total.count === 0 ? 'empty' : 'no-results' };
  return { ...base, state: 'ready' };
}

async function serviceClient() {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient() as unknown as CustomerEmployeeRegistryClient;
}

export function createCustomerEmployeeRegistrySupabaseStore(
  client: CustomerEmployeeRegistryClient,
  today: string,
): CustomerEmployeeRegistryStore {
  return {
    list: async ({ tenantId, companyId, search, from, to }) => {
      let query = client
        .from('employees')
        .select('id, tenant_id, company_id, name, nationality, status, visa_expiry, eid_expiry', {
          count: 'exact',
        })
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId);
      if (search.status !== 'all') query = query.eq('status', search.status);
      if (search.expiry === 'missing') query = query.or('visa_expiry.is.null,eid_expiry.is.null');
      if (search.expiry === 'attention')
        query = query.or(
          `visa_expiry.lte.${addSignalDays(today, 90)},eid_expiry.lte.${addSignalDays(today, 90)}`,
        );
      if (search.q) query = query.or(`name.ilike.%${escapeIlike(search.q)}%`);
      return (await query
        .order(search.sort, { ascending: search.direction === 'asc', nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, to)) as unknown as {
        data: EmployeeDbRow[] | null;
        count: number | null;
        error: unknown | null;
      };
    },
    total: async ({ tenantId, companyId }) =>
      (await client
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)) as unknown as { count: number | null; error: unknown | null },
  };
}

function expiryState(expiry: string | null, today: string): CustomerEmployeeRow['visaState'] {
  if (!isStrictDate(expiry)) return 'missing';
  const days = signalDaysBetween(today, expiry);
  if (days < 0) return 'expired';
  if (days <= 90) return 'attention';
  return 'current';
}

function isStrictDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function escapeIlike(value: string) {
  return value
    .replace(/[,%_()]/gu, ' ')
    .replace(/\\/gu, '\\\\')
    .trim();
}
