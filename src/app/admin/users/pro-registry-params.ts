import { proRegistryFiltersSchema } from '@/lib/validation/pro-lifecycle';

export type ProRegistryFilters = {
  role: 'pro';
  q?: string;
  accountStatus?: 'invited' | 'active' | 'inactive';
  credentialState?:
    | 'draft'
    | 'submitted'
    | 'under_review'
    | 'verified'
    | 'rejected'
    | 'expired'
    | 'revoked';
  eligibility?: 'eligible' | 'ineligible';
  assignment?: 'assigned' | 'unassigned';
  expiryWindow?: 'expired' | '30_days' | '60_days' | '90_days';
  sort: 'created_at' | 'full_name' | 'credential_expiry' | 'state';
  direction: 'asc' | 'desc';
  page: number;
};

export type RawProRegistryParams = Record<string, string | string[] | undefined>;

export const PRO_REGISTRY_DEFAULTS: ProRegistryFilters = {
  role: 'pro',
  sort: 'created_at',
  direction: 'desc',
  page: 1,
};

const ALLOWED_KEYS = new Set([
  'role',
  'q',
  'accountStatus',
  'credentialState',
  'eligibility',
  'assignment',
  'expiryWindow',
  'sort',
  'direction',
  'page',
]);

export function parseProRegistryParams(raw: RawProRegistryParams): {
  filters: ProRegistryFilters;
  invalid: boolean;
} {
  if (
    Object.keys(raw).some((key) => !ALLOWED_KEYS.has(key)) ||
    Object.values(raw).some(Array.isArray)
  ) {
    return { filters: PRO_REGISTRY_DEFAULTS, invalid: true };
  }
  const normalized = { ...raw };
  for (const key of [
    'q',
    'accountStatus',
    'credentialState',
    'eligibility',
    'assignment',
    'expiryWindow',
  ] as const) {
    const value = normalized[key];
    if (typeof value === 'string' && value.trim() === '') delete normalized[key];
  }
  const parsed = proRegistryFiltersSchema.safeParse(normalized);
  if (!parsed.success) return { filters: PRO_REGISTRY_DEFAULTS, invalid: true };
  return {
    filters: {
      ...parsed.data,
      sort: parsed.data.sort ?? PRO_REGISTRY_DEFAULTS.sort,
      direction: parsed.data.direction ?? PRO_REGISTRY_DEFAULTS.direction,
      page: parsed.data.page ?? PRO_REGISTRY_DEFAULTS.page,
    },
    invalid: false,
  };
}

type ProRegistryPatch = Partial<Omit<ProRegistryFilters, 'role'>> & { reset?: boolean };

export function buildProRegistryHref(current: ProRegistryFilters, patch: ProRegistryPatch): string {
  if (patch.reset) return '/admin/users?role=pro';
  const next: ProRegistryFilters = {
    ...current,
    ...patch,
    role: 'pro',
    page: 'page' in patch ? (patch.page ?? 1) : 1,
  };
  const params = new URLSearchParams({ role: 'pro' });
  for (const key of [
    'q',
    'accountStatus',
    'credentialState',
    'eligibility',
    'assignment',
    'expiryWindow',
    'sort',
    'direction',
  ] as const) {
    const value = next[key];
    if (value !== undefined) params.set(key, value);
  }
  if (next.page > 1) params.set('page', String(next.page));
  return `/admin/users?${params.toString()}`;
}
