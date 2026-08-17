import 'server-only';

import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import type { Database } from '@/lib/db/database.types';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { TenantPlan, TenantStatus } from '@/lib/validation/tenant-onboarding';

export type CompanyStatus = Database['public']['Enums']['company_status'];

export type CompanyRow = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  workspaceName: string;
  plan: TenantPlan;
  tenantStatus: TenantStatus;
  companyName: string;
  companyStatus: CompanyStatus;
  tradeLicenseNo: string | null;
  jurisdiction: string | null;
  createdAt: string;
  currentAssignmentId: string | null;
  currentProProfileId: string | null;
  currentProName: string | null;
};

export type ListCompaniesArgs = {
  status?: CompanyStatus | 'all';
  q?: string | null;
  tenantId?: string | null;
  page?: number;
  pageSize?: number;
};

export type CompanyPage = {
  rows: CompanyRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type CompanyQueryResult = {
  data: unknown;
  error: { message?: string } | null;
  count?: number | null;
};

type CompanyQuery = {
  select(columns: string, options?: { count?: 'exact' }): CompanyQuery;
  eq(column: string, value: unknown): CompanyQuery;
  ilike(column: string, value: string): CompanyQuery;
  order(column: string, options: { ascending: boolean }): CompanyQuery;
  range(from: number, to: number): Promise<CompanyQueryResult>;
  maybeSingle(): Promise<CompanyQueryResult>;
};

type CompanyClient = { from(table: string): CompanyQuery };
type CompanyReaderDeps = {
  requireOperator?: () => Promise<unknown>;
  client?: CompanyClient;
};

type CompanyDbRow = {
  id: string;
  tenant_id: string;
  company_name: string;
  status: CompanyStatus;
  trade_license_no: string | null;
  jurisdiction: string | null;
  created_at: string;
  tenants:
    | {
        slug: string;
        name: string;
        plan: TenantPlan;
        status: TenantStatus;
      }
    | Array<{
        slug: string;
        name: string;
        plan: TenantPlan;
        status: TenantStatus;
      }>;
  active_assignments?: Array<{
    id: string;
    pro_profile_id: string;
    profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  }> | null;
};

type AssignmentDbRow = NonNullable<CompanyDbRow['active_assignments']>[number];

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function toCompanyRow(row: CompanyDbRow, assignment?: AssignmentDbRow | null): CompanyRow {
  const tenant = relatedOne(row.tenants);
  if (!tenant) throw new ApiError('INTERNAL', 'Unable to load company workspace', 500);
  const activeAssignment = assignment ?? relatedOne(row.active_assignments);
  const pro = relatedOne(activeAssignment?.profiles);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantSlug: tenant.slug,
    workspaceName: tenant.name,
    plan: tenant.plan,
    tenantStatus: tenant.status,
    companyName: row.company_name,
    companyStatus: row.status,
    tradeLicenseNo: row.trade_license_no,
    jurisdiction: row.jurisdiction,
    createdAt: row.created_at,
    currentAssignmentId: activeAssignment?.id ?? null,
    currentProProfileId: activeAssignment?.pro_profile_id ?? null,
    currentProName: pro?.full_name ?? null,
  };
}

const COMPANY_SELECT = `
  id, tenant_id, company_name, status, trade_license_no, jurisdiction, created_at,
  tenants!inner(slug, name, plan, status),
  active_assignments:pro_company_assignments!pro_company_assignments_company_id_fkey(
    id, pro_profile_id, status,
    profiles!pro_company_assignments_pro_profile_id_fkey(full_name)
  )
`;
const idSchema = z.string().uuid();

export async function listCompanies(
  args: ListCompaniesArgs = {},
  deps: CompanyReaderDeps = {},
): Promise<CompanyPage> {
  await (deps.requireOperator ?? requirePlatformOperator)();
  if (args.tenantId && !idSchema.safeParse(args.tenantId).success) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid company tenant filter', 400);
  }
  const admin = deps.client ?? (createSupabaseServiceRoleClient() as unknown as CompanyClient);
  const page = Number.isSafeInteger(args.page) && (args.page ?? 0) >= 1 ? args.page! : 1;
  const pageSize =
    Number.isSafeInteger(args.pageSize) && (args.pageSize ?? 0) >= 1 && (args.pageSize ?? 0) <= 100
      ? args.pageSize!
      : 25;
  const from = (page - 1) * pageSize;
  let query = admin
    .from('company_profiles')
    .select(COMPANY_SELECT, { count: 'exact' })
    .eq('active_assignments.status', 'active');

  if (args.status && args.status !== 'all') query = query.eq('status', args.status);
  if (args.tenantId) query = query.eq('tenant_id', args.tenantId);
  if (args.q?.trim()) {
    const escaped = args.q.trim().replaceAll('%', '\\%').replaceAll('_', '\\_');
    query = query.ilike('company_name', `%${escaped}%`);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    console.error('listCompanies failed', error);
    throw new ApiError('INTERNAL', 'Unable to load companies', 500);
  }
  const total = count ?? 0;
  return {
    rows: ((data as CompanyDbRow[] | null) ?? []).map((row) => toCompanyRow(row)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCompanyById(
  id: string,
  deps: CompanyReaderDeps = {},
): Promise<CompanyRow | null> {
  await (deps.requireOperator ?? requirePlatformOperator)();
  if (!idSchema.safeParse(id).success) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid company identifier', 400);
  }
  const admin = deps.client ?? (createSupabaseServiceRoleClient() as unknown as CompanyClient);
  const { data, error } = await admin
    .from('company_profiles')
    .select(COMPANY_SELECT)
    .eq('id', id)
    .eq('active_assignments.status', 'active')
    .maybeSingle();
  if (error) {
    console.error('getCompanyById failed', error);
    throw new ApiError('INTERNAL', 'Unable to load company workspace', 500);
  }
  return data ? toCompanyRow(data as unknown as CompanyDbRow) : null;
}
