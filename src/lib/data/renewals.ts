import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { addSignalDays, signalBusinessDate, signalDaysBetween } from '@/lib/data/signal-finance';
import { loadAllRangePages } from '@/lib/data/range-pagination';
import type { RenewalStage, RenewalTypeInput } from '@/lib/validation/renewal';
import { RENEWAL_COLUMNS, renewalCostsFromRow, type RenewalCosts } from '@/lib/renewals/row';

export { RENEWAL_COLUMNS, renewalCostsFromRow, type RenewalCosts };

// Renewal writes flow only through the P3.08 RPC commands in `@/lib/renewals/commands`.
export type RenewalType = RenewalTypeInput;
export type { RenewalStage };
export type RenewalStatus = 'upcoming' | 'due_soon' | 'overdue' | 'completed' | 'cancelled';
export type RenewalSource = 'license_backfill' | 'manual' | 'company_onboarding';

export type RenewalRow = {
  id: string;
  tenantId: string;
  companyId: string;
  type: RenewalType;
  label: string;
  dueDate: string;
  daysOut: number;
  status: RenewalStatus;
  stage: RenewalStage;
  version: number;
  employeeId: string | null;
  blockerCode: string | null;
  costs: RenewalCosts;
  source: RenewalSource;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RenewalDbRow = {
  id: string;
  tenant_id: string;
  company_id: string;
  type: RenewalType;
  label: string;
  due_date: string;
  status: RenewalStatus;
  stage: RenewalStage;
  version: number;
  employee_id: string | null;
  blocker_code: string | null;
  government_fee_minor: number;
  pro_service_fee_minor: number;
  fine_minor: number;
  currency: string;
  source: RenewalSource;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const ACTIVE_STATUSES: RenewalStatus[] = ['upcoming', 'due_soon', 'overdue'];

function toRenewalRow(r: RenewalDbRow, today = signalBusinessDate()): RenewalRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    type: r.type,
    label: r.label,
    dueDate: r.due_date,
    daysOut: signalDaysBetween(today, r.due_date),
    status: r.status,
    stage: r.stage,
    version: Number(r.version),
    employeeId: r.employee_id,
    blockerCode: r.blocker_code,
    costs: renewalCostsFromRow(r),
    source: r.source,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type ListRenewalsForTenantOpts = {
  id?: string;
  status?: RenewalStatus[];
  bucket?: 7 | 30 | 60 | 90 | 'all';
  type?: RenewalType;
  deadlineDate?: string;
  deadlinePeriod?: 'morning' | 'afternoon';
  today?: string;
};

export async function listRenewalsForTenant(
  tenantId: string,
  opts: ListRenewalsForTenantOpts = {},
): Promise<RenewalRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('renewals')
    .select(RENEWAL_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('due_date', { ascending: true });

  if (opts.id) {
    query = query.eq('id', opts.id);
  } else if (opts.status && opts.status.length > 0) {
    query = query.in('status', opts.status);
  }
  if (!opts.id && opts.bucket && opts.bucket !== 'all') {
    query = query.lte('due_date', addSignalDays(opts.today ?? signalBusinessDate(), opts.bucket));
  }
  if (!opts.id && opts.type) query = query.eq('type', opts.type);
  if (!opts.id && opts.deadlineDate) {
    query =
      opts.deadlinePeriod === 'afternoon'
        ? query.eq('due_date', opts.deadlineDate)
        : query.eq('due_date', '__date_only_deadlines_are_afternoon__');
  }

  const { data, error } = await query;
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  const today = opts.today ?? signalBusinessDate();
  return ((data as RenewalDbRow[] | null) ?? []).map((row) => toRenewalRow(row, today));
}

export type ListRenewalsForCompanyOpts = ListRenewalsForTenantOpts & {
  includeCancelled?: boolean;
};

export async function listRenewalsForCompany(
  tenantId: string,
  companyId: string,
  opts: ListRenewalsForCompanyOpts = {},
): Promise<RenewalRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('renewals')
    .select(RENEWAL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true });

  if (opts.id) {
    query = query.eq('id', opts.id);
  } else if (opts.status && opts.status.length > 0) {
    query = query.in('status', opts.status);
  } else if (!opts.includeCancelled) {
    query = query.neq('status', 'cancelled');
  }
  if (!opts.id && opts.bucket && opts.bucket !== 'all') {
    query = query.lte('due_date', addSignalDays(opts.today ?? signalBusinessDate(), opts.bucket));
  }
  if (!opts.id && opts.type) query = query.eq('type', opts.type);
  if (!opts.id && opts.deadlineDate) {
    query =
      opts.deadlinePeriod === 'afternoon'
        ? query.eq('due_date', opts.deadlineDate)
        : query.eq('due_date', '__date_only_deadlines_are_afternoon__');
  }

  const data = await loadAllRangePages<RenewalDbRow>('company renewals', (from, to) =>
    query.range(from, to),
  );
  const today = signalBusinessDate();
  return data.map((row) => toRenewalRow(row, today));
}

export async function countRenewalsDueWithin(tenantId: string, days = 30): Promise<number> {
  const admin = createSupabaseServiceRoleClient();
  const cutoffDate = addSignalDays(signalBusinessDate(), days);

  const { count, error } = await admin
    .from('renewals')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .lte('due_date', cutoffDate)
    .in('status', ACTIVE_STATUSES);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return count ?? 0;
}
