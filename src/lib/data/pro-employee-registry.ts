import 'server-only';

import { z } from 'zod';

export const EMPLOYEE_REGISTRY_PAGE_SIZE = 25;

const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'inactive', 'terminated']).optional(),
  identity: z.enum(['all', 'visa', 'eid']).optional(),
  risk: z.enum(['all', 'attention']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  focus: z.string().uuid().optional(),
});

export type EmployeeRegistrySearch = {
  q: string;
  status: 'all' | 'active' | 'inactive' | 'terminated';
  identity: 'all' | 'visa' | 'eid';
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
  risk: EmployeeRisk;
};

export type EmployeeIdentityState = 'missing' | 'expired' | 'attention' | 'current';
export type EmployeeRisk = 'attention' | 'clear' | 'unknown';

export type EmployeeRegistryResult =
  | {
      state: 'data';
      rows: EmployeeRegistryRow[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { state: 'unavailable'; rows: []; total: 0; page: number; pageSize: number };

type EmployeeRegistryDbRow = {
  id: string;
  name: string;
  email: string | null;
  nationality: string | null;
  status: 'active' | 'inactive' | 'terminated';
  visa_expiry: string | null;
  eid_expiry: string | null;
};

export function parseEmployeeRegistrySearch(input: Record<string, string | string[] | undefined>) {
  const value = (key: string) => {
    const raw = input[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const parsed = searchSchema.safeParse({
    q: value('q'),
    status: value('status'),
    identity: value('identity'),
    risk: value('risk'),
    page: value('page'),
    focus: value('focus'),
  });
  const data = parsed.success ? parsed.data : {};
  return {
    q: data.q ?? '',
    status: data.status ?? 'all',
    identity: data.identity ?? 'all',
    risk: data.risk ?? 'all',
    page: data.page ?? 1,
    focus: data.focus ?? null,
  } satisfies EmployeeRegistrySearch;
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

/** Deliberately returns no identity characters; this is safe for unavailable identity fields. */
export function maskIdentifierPresence(value: string | null): 'missing' | 'recorded' {
  return value ? 'recorded' : 'missing';
}

export async function listProEmployeeRegistry(
  tenantId: string,
  companyId: string,
  search: EmployeeRegistrySearch,
  now = new Date(),
): Promise<EmployeeRegistryResult> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  const from = (search.page - 1) * EMPLOYEE_REGISTRY_PAGE_SIZE;
  const to = from + EMPLOYEE_REGISTRY_PAGE_SIZE - 1;
  let query = admin
    .from('employees')
    .select('id, name, email, nationality, status, visa_expiry, eid_expiry', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId);

  if (search.status !== 'all') query = query.eq('status', search.status);
  if (search.identity === 'visa') query = query.not('visa_expiry', 'is', null);
  if (search.identity === 'eid') query = query.not('eid_expiry', 'is', null);
  if (search.risk === 'attention') {
    const cutoff = isoDateInDubai(now, 90);
    query = query.or(`visa_expiry.lte.${cutoff},eid_expiry.lte.${cutoff}`);
  }
  if (search.focus) query = query.eq('id', search.focus);
  if (search.q) {
    const term = escapeIlike(search.q);
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to);
  if (error || count === null) {
    console.error('pro-employee-registry unavailable');
    return {
      state: 'unavailable',
      rows: [],
      total: 0,
      page: search.page,
      pageSize: EMPLOYEE_REGISTRY_PAGE_SIZE,
    };
  }

  return {
    state: 'data',
    rows: ((data ?? []) as EmployeeRegistryDbRow[]).map((row) => toRegistryRow(row, now)),
    total: count,
    page: search.page,
    pageSize: EMPLOYEE_REGISTRY_PAGE_SIZE,
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
