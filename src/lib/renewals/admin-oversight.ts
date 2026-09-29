import 'server-only';

import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { projectEmployeeForRole, type EmployeeView } from '@/lib/employees/privacy';
import { callP308, type P308RpcClient } from '@/lib/p308/rpc';
import {
  addDubaiDays,
  dubaiBusinessDate,
  renewalBucket,
  type RenewalBucket,
} from './dubai-calendar';

/**
 * Platform-operator oversight reads (called only after requirePlatformOperator).
 * Stable keyset-free pagination: fixed order with an id tie-breaker.
 */
export const ADMIN_OVERSIGHT_PAGE_SIZE = 50;

export type AdminRenewalRow = {
  id: string;
  companyName: string;
  type: string;
  label: string;
  dueDate: string;
  stage: string;
  bucket: RenewalBucket;
  blocked: boolean;
};

export type RenewalHealth = {
  dubai_today: string;
  stale: boolean;
  scheduled_reminders: number;
  last_run: null | { dubai_date: string; finished_at: string; status_changes: number };
};

export async function loadAdminRenewalOversight(page: number) {
  const admin = createSupabaseServiceRoleClient();
  const today = dubaiBusinessDate();
  const from = (Math.max(1, page) - 1) * ADMIN_OVERSIGHT_PAGE_SIZE;
  const active = ['due', 'in_progress', 'documents_submitted', 'government_processing'];
  const [list, overdue, week, days90, health] = await Promise.all([
    admin
      .from('renewals')
      .select(
        'id, type, label, due_date, stage, blocker_code, company:company_profiles!renewals_company_tenant_fk(company_name)',
        {
          count: 'exact',
        },
      )
      .in('stage', active)
      .order('due_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + ADMIN_OVERSIGHT_PAGE_SIZE - 1),
    admin
      .from('renewals')
      .select('id', { count: 'exact', head: true })
      .in('stage', active)
      .lt('due_date', today),
    admin
      .from('renewals')
      .select('id', { count: 'exact', head: true })
      .in('stage', active)
      .gte('due_date', today)
      .lte('due_date', addDubaiDays(today, 7)),
    admin
      .from('renewals')
      .select('id', { count: 'exact', head: true })
      .in('stage', active)
      .gte('due_date', today)
      .lte('due_date', addDubaiDays(today, 90)),
    callP308<RenewalHealth>(
      admin as unknown as P308RpcClient,
      'p308_read_renewal_health',
      {},
    ).catch(() => null),
  ]);
  if (list.error) return { state: 'unavailable' as const };
  const rows: AdminRenewalRow[] = (list.data ?? []).map((row) => {
    const company = row.company as
      | { company_name?: string }
      | Array<{ company_name?: string }>
      | null;
    const name = Array.isArray(company) ? company[0]?.company_name : company?.company_name;
    return {
      id: row.id as string,
      companyName: name ?? '—',
      type: row.type as string,
      label: row.label as string,
      dueDate: row.due_date as string,
      stage: row.stage as string,
      bucket: renewalBucket(row.due_date as string, today),
      blocked: Boolean(row.blocker_code),
    };
  });
  return {
    state: 'data' as const,
    rows,
    total: list.count ?? rows.length,
    counts: {
      overdue: overdue.count ?? null,
      week: week.count ?? null,
      days90: days90.count ?? null,
    },
    health,
    page: Math.max(1, page),
  };
}

export async function loadAdminEmployeeOversight(page: number) {
  const admin = createSupabaseServiceRoleClient();
  const today = dubaiBusinessDate();
  const horizon = addDubaiDays(today, 90);
  const from = (Math.max(1, page) - 1) * ADMIN_OVERSIGHT_PAGE_SIZE;
  const [list, visaRisk, eidRisk] = await Promise.all([
    admin
      .from('employees')
      .select(
        'id, version, name, email, phone, nationality, job_title, status, passport_no_last4, visa_no_last4, emirates_id_last4, visa_expiry, eid_expiry, company:company_profiles!employees_company_tenant_fk(company_name)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + ADMIN_OVERSIGHT_PAGE_SIZE - 1),
    admin
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .lte('visa_expiry', horizon),
    admin
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .lte('eid_expiry', horizon),
  ]);
  if (list.error) return { state: 'unavailable' as const };
  const rows: Array<EmployeeView & { companyName: string }> = (list.data ?? []).map((row) => {
    const company = row.company as
      | { company_name?: string }
      | Array<{ company_name?: string }>
      | null;
    const name = Array.isArray(company) ? company[0]?.company_name : company?.company_name;
    return {
      ...projectEmployeeForRole('admin', {
        id: row.id as string,
        version: Number(row.version),
        name: row.name as string,
        email: row.email ?? null,
        phone: row.phone ?? null,
        nationality: row.nationality ?? null,
        jobTitle: row.job_title ?? null,
        status: row.status as EmployeeView['status'],
        passportLast4: row.passport_no_last4 ?? null,
        visaLast4: row.visa_no_last4 ?? null,
        emiratesIdLast4: row.emirates_id_last4 ?? null,
        visaExpiry: row.visa_expiry ?? null,
        eidExpiry: row.eid_expiry ?? null,
      }),
      companyName: name ?? '—',
    };
  });
  return {
    state: 'data' as const,
    rows,
    total: list.count ?? rows.length,
    counts: { visaRisk: visaRisk.count ?? null, eidRisk: eidRisk.count ?? null },
    page: Math.max(1, page),
  };
}
