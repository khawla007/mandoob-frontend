import 'server-only';

import { z } from 'zod';

export const EMPLOYEE_REGISTRY_PAGE_SIZE = 25;

const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'inactive', 'terminated']).optional(),
  visa: z.enum(['any', 'recorded_expiry', 'missing_expiry']).optional(),
  eid: z.enum(['any', 'recorded_expiry', 'missing_expiry']).optional(),
  risk: z.enum(['all', 'attention']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  focus: z.string().uuid().optional(),
});

export type EmployeeRegistrySearch = {
  q: string;
  status: 'all' | 'active' | 'inactive' | 'terminated';
  visa: 'any' | 'recorded_expiry' | 'missing_expiry';
  eid: 'any' | 'recorded_expiry' | 'missing_expiry';
  risk: 'all' | 'attention';
  page: number;
  focus: string | null;
};

export type EmployeeRegistryRow = {
  id: string;
  name: string;
  email: string | null;
  nationality: string | null;
  status: 'active' | 'inactive' | 'terminated';
  visaExpiry: string | null;
  eidExpiry: string | null;
  visaState: EmployeeIdentityState;
  eidState: EmployeeIdentityState;
  visaIdentifierState: EmployeeIdentifierDisplayState;
  eidIdentifierState: EmployeeIdentifierDisplayState;
  risk: EmployeeRisk;
};

export type EmployeeIdentityState = 'missing' | 'expired' | 'attention' | 'current';
export type EmployeeIdentifierDisplayState = 'unavailable_without_masked_contract';
export type EmployeeRisk = 'attention' | 'clear' | 'unknown';

export function employeeIdentifierDisplayState(): EmployeeIdentifierDisplayState {
  return 'unavailable_without_masked_contract';
}

type RegistryBase = {
  rows: EmployeeRegistryRow[];
  total: number;
  unfilteredTotal: number | null;
  page: number;
  pageSize: number;
  canonicalPage: number;
  phase3Unavailable: true;
};

export type EmployeeRegistryResult =
  | (RegistryBase & { state: 'data' })
  | (RegistryBase & { state: 'empty' })
  | (RegistryBase & { state: 'no_results' })
  | (RegistryBase & { state: 'partial' })
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

type EmployeeRegistryDbRow = {
  id: string;
  name: string;
  email: string | null;
  nationality: string | null;
  status: 'active' | 'inactive' | 'terminated';
  visa_expiry: string | null;
  eid_expiry: string | null;
};

export type EmployeeRegistryAccess = { tenantId: string; companyId: string };
export type EmployeeRegistryInput = {
  actorProfileId: string;
  tenantSlug: string;
  search: EmployeeRegistrySearch;
};
export type EmployeeRegistryStore = {
  list: (
    input: EmployeeRegistryAccess & { search: EmployeeRegistrySearch; from: number; to: number },
  ) => Promise<{
    data: EmployeeRegistryDbRow[] | null;
    count: number | null;
    error: unknown | null;
  }>;
  total: (
    input: EmployeeRegistryAccess,
  ) => Promise<{ count: number | null; error: unknown | null }>;
};
export type EmployeeRegistryDependencies = {
  authorize?: (
    input: Pick<EmployeeRegistryInput, 'actorProfileId' | 'tenantSlug'>,
  ) => Promise<EmployeeRegistryAccess>;
  store?: EmployeeRegistryStore;
};
type EmployeeRegistrySupabaseQuery = PromiseLike<unknown> & {
  select: (
    columns: string,
    options?: { count: 'exact'; head?: boolean },
  ) => EmployeeRegistrySupabaseQuery;
  eq: (column: string, value: string) => EmployeeRegistrySupabaseQuery;
  not: (column: string, operator: string, value: null) => EmployeeRegistrySupabaseQuery;
  is: (column: string, value: null) => EmployeeRegistrySupabaseQuery;
  or: (filter: string) => EmployeeRegistrySupabaseQuery;
  order: (column: string, options: { ascending: boolean }) => EmployeeRegistrySupabaseQuery;
  range: (from: number, to: number) => EmployeeRegistrySupabaseQuery;
};
export type EmployeeRegistrySupabaseClient = {
  from: (table: string) => EmployeeRegistrySupabaseQuery;
};

export function parseEmployeeRegistrySearch(input: Record<string, string | string[] | undefined>) {
  const value = (key: string) => {
    const raw = input[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const parsed = searchSchema.safeParse({
    q: value('q'),
    status: value('status'),
    visa: value('visa'),
    eid: value('eid'),
    risk: value('risk'),
    page: value('page'),
    focus: value('focus'),
  });
  const data = parsed.success ? parsed.data : {};
  return {
    q: data.q ?? '',
    status: data.status ?? 'all',
    visa: data.visa ?? 'any',
    eid: data.eid ?? 'any',
    risk: data.risk ?? 'all',
    page: data.page ?? 1,
    focus: data.focus ?? null,
  } satisfies EmployeeRegistrySearch;
}

export function employeeRegistryHref(
  slug: string,
  search: EmployeeRegistrySearch,
  page = search.page,
) {
  const query = new URLSearchParams();
  if (search.q) query.set('q', search.q);
  if (search.status !== 'all') query.set('status', search.status);
  if (search.visa !== 'any') query.set('visa', search.visa);
  if (search.eid !== 'any') query.set('eid', search.eid);
  if (search.risk !== 'all') query.set('risk', search.risk);
  if (search.focus) query.set('focus', search.focus);
  if (page > 1) query.set('page', String(page));
  const suffix = query.toString();
  return `/t/${encodeURIComponent(slug)}/employees${suffix ? `?${suffix}` : ''}`;
}

export function employeeRisk(
  visaExpiry: string | null,
  eidExpiry: string | null,
  now = new Date(),
): EmployeeRisk {
  const states = [identityState(visaExpiry, now), identityState(eidExpiry, now)];
  if (states.some((state) => state === 'expired' || state === 'attention')) return 'attention';
  if (states.every((state) => state === 'missing')) return 'unknown';
  return 'clear';
}

/** The only public registry read: authorization and current Company assignment are resolved here. */
export async function listProEmployeeRegistry(
  input: EmployeeRegistryInput,
  dependencies: EmployeeRegistryDependencies = {},
  now = new Date(),
): Promise<EmployeeRegistryResult> {
  const access = await (dependencies.authorize ?? authorizeRegistryRead)({
    actorProfileId: input.actorProfileId,
    tenantSlug: input.tenantSlug,
  });
  const store = dependencies.store ?? (await createSupabaseEmployeeRegistryStore(now));
  const from = (input.search.page - 1) * EMPLOYEE_REGISTRY_PAGE_SIZE;
  const to = from + EMPLOYEE_REGISTRY_PAGE_SIZE - 1;
  const [listed, total] = await Promise.all([
    store.list({ ...access, search: input.search, from, to }),
    store.total(access),
  ]);
  if (listed.error || listed.count === null) return unavailable(input.search.page);

  const rows = (listed.data ?? []).map((row) => toRegistryRow(row, now));
  const pageCount = Math.max(1, Math.ceil(listed.count / EMPLOYEE_REGISTRY_PAGE_SIZE));
  const canonicalPage = Math.min(input.search.page, pageCount);
  const base: RegistryBase = {
    rows,
    total: listed.count,
    unfilteredTotal: total.error || total.count === null ? null : total.count,
    page: input.search.page,
    pageSize: EMPLOYEE_REGISTRY_PAGE_SIZE,
    canonicalPage,
    phase3Unavailable: true,
  };
  if (total.error || total.count === null) return { ...base, state: 'partial' };
  if (listed.count === 0) return { ...base, state: total.count === 0 ? 'empty' : 'no_results' };
  return { ...base, state: 'data' };
}

async function authorizeRegistryRead({
  actorProfileId,
  tenantSlug,
}: Pick<EmployeeRegistryInput, 'actorProfileId' | 'tenantSlug'>): Promise<EmployeeRegistryAccess> {
  const [{ requireProTenantRouteAccess }, { requireActiveTenant }, { readAssignedCompanyForPro }] =
    await Promise.all([
      import('@/lib/auth/require-tenant-route-access'),
      import('@/lib/auth/require-active-tenant'),
      import('@/lib/data/company-profile'),
    ]);
  const { session, tenant } = await requireProTenantRouteAccess(tenantSlug);
  if (session.id !== actorProfileId) throw new Error('PRO_ACTOR_MISMATCH');
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, tenantSlug);
  if (!company || company.tenantId !== tenant.id) throw new Error('ASSIGNED_COMPANY_MISMATCH');
  return { tenantId: tenant.id, companyId: company.id };
}

async function createSupabaseEmployeeRegistryStore(now: Date): Promise<EmployeeRegistryStore> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createEmployeeRegistrySupabaseStore(
    createSupabaseServiceRoleClient() as unknown as EmployeeRegistrySupabaseClient,
    now,
  );
}

export function createEmployeeRegistrySupabaseStore(
  admin: EmployeeRegistrySupabaseClient,
  now: Date,
): EmployeeRegistryStore {
  return {
    list: async ({ tenantId, companyId, search, from, to }) => {
      let query = admin
        .from('employees')
        .select('id, name, email, nationality, status, visa_expiry, eid_expiry', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId);
      if (search.status !== 'all') query = query.eq('status', search.status);
      if (search.visa === 'recorded_expiry') query = query.not('visa_expiry', 'is', null);
      if (search.visa === 'missing_expiry') query = query.is('visa_expiry', null);
      if (search.eid === 'recorded_expiry') query = query.not('eid_expiry', 'is', null);
      if (search.eid === 'missing_expiry') query = query.is('eid_expiry', null);
      if (search.risk === 'attention')
        query = query.or(
          `visa_expiry.lte.${isoDateInDubai(now, 90)},eid_expiry.lte.${isoDateInDubai(now, 90)}`,
        );
      if (search.focus) query = query.eq('id', search.focus);
      if (search.q) {
        const term = escapeIlike(search.q);
        query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
      }
      return (await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)) as unknown as {
        data: EmployeeRegistryDbRow[] | null;
        count: number | null;
        error: unknown | null;
      };
    },
    total: async ({ tenantId, companyId }) => {
      return (await admin
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)) as unknown as { count: number | null; error: unknown | null };
    },
  };
}

function unavailable(page: number): EmployeeRegistryResult {
  return {
    state: 'unavailable',
    rows: [],
    total: 0,
    unfilteredTotal: null,
    page,
    pageSize: EMPLOYEE_REGISTRY_PAGE_SIZE,
    canonicalPage: page,
    phase3Unavailable: true,
    error: 'sanitized',
  };
}

function toRegistryRow(row: EmployeeRegistryDbRow, now: Date): EmployeeRegistryRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    nationality: row.nationality,
    status: row.status,
    visaExpiry: row.visa_expiry,
    eidExpiry: row.eid_expiry,
    visaState: identityState(row.visa_expiry, now),
    eidState: identityState(row.eid_expiry, now),
    visaIdentifierState: employeeIdentifierDisplayState(),
    eidIdentifierState: employeeIdentifierDisplayState(),
    risk: employeeRisk(row.visa_expiry, row.eid_expiry, now),
  };
}

function identityState(expiry: string | null, now: Date): EmployeeIdentityState {
  if (!expiry) return 'missing';
  const date = new Date(`${expiry}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'missing';
  const today = new Date(`${isoDateInDubai(now, 0)}T00:00:00Z`);
  const days = Math.floor((date.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 90) return 'attention';
  return 'current';
}

function isoDateInDubai(now: Date, offsetDays: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = new Date(`${value.year}-${value.month}-${value.day}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10);
}

function escapeIlike(value: string) {
  return value
    .replace(/[,%_()]/g, ' ')
    .replace(/\\/g, '\\\\')
    .trim();
}
