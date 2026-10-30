import 'server-only';

import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { EmployeePortalAccess } from '@/lib/data/employee-portal-workspace';
import {
  buildRenewalCalendarMonth,
  dubaiBusinessDate,
  renewalUrgency,
  type RenewalUrgency,
} from '@/lib/renewals/dubai-calendar';

/**
 * Employee self-service reads. Every query is keyed by the employee id that
 * `authorizeEmployeePortalRead` resolved from the session; no URL value is used.
 */
export type EmployeeSelfState = {
  version: number;
  phone: string | null;
  renewalRemindersEnabled: boolean | null;
};

export async function readEmployeeSelfState(
  access: EmployeePortalAccess,
): Promise<EmployeeSelfState> {
  const admin = createSupabaseServiceRoleClient();
  const [employee, preference] = await Promise.all([
    admin
      .from('employees')
      .select('id, version, phone')
      .eq('id', access.employee.id)
      .eq('tenant_id', access.tenant.id)
      .eq('profile_id', access.session.id)
      .maybeSingle(),
    admin
      .from('employee_notification_preferences')
      .select('renewal_reminders_enabled')
      .eq('employee_id', access.employee.id)
      .eq('profile_id', access.session.id)
      .maybeSingle(),
  ]);
  if (employee.error || !employee.data) throw new Error('EMPLOYEE_SELF_UNAVAILABLE');
  return {
    version: Number(employee.data.version),
    phone: employee.data.phone ?? null,
    renewalRemindersEnabled: preference.error
      ? null
      : (preference.data?.renewal_reminders_enabled ?? true),
  };
}

export type EmployeeCalendarRenewal = {
  id: string;
  dueDate: string;
  label: string;
  type: string;
  stage: string;
  urgency: RenewalUrgency;
};

async function ownRenewals(access: EmployeePortalAccess) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('renewals')
    .select('id, due_date, label, type, stage')
    .eq('tenant_id', access.tenant.id)
    .eq('company_id', access.employee.companyId)
    .eq('employee_id', access.employee.id)
    .neq('stage', 'cancelled')
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(500);
  if (error) throw new Error('EMPLOYEE_RENEWALS_UNAVAILABLE');
  const today = dubaiBusinessDate();
  return (data ?? []).map((row) => ({
    id: row.id as string,
    dueDate: row.due_date as string,
    label: row.label as string,
    type: row.type as string,
    stage: row.stage as string,
    urgency: renewalUrgency(row.due_date as string, today),
  }));
}

export async function loadEmployeeRenewalCalendar(access: EmployeePortalAccess, month: string) {
  return buildRenewalCalendarMonth(await ownRenewals(access), month);
}

export type EmployeeActivityItem = {
  id: string;
  at: string;
  source: 'profile' | 'renewal';
  action: string;
  stage: string | null;
};

export async function loadEmployeeActivity(
  access: EmployeePortalAccess,
): Promise<EmployeeActivityItem[]> {
  const admin = createSupabaseServiceRoleClient();
  const renewalIds = (await ownRenewals(access)).map((row) => row.id);
  const [profile, renewals] = await Promise.all([
    admin
      .from('employee_audit_events')
      .select('id, action, created_at')
      .eq('tenant_id', access.tenant.id)
      .eq('company_id', access.employee.companyId)
      .eq('employee_id', access.employee.id)
      .order('created_at', { ascending: false })
      .limit(50),
    renewalIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin
          .from('renewal_stage_events')
          .select('id, action, to_stage, created_at')
          .eq('tenant_id', access.tenant.id)
          .eq('company_id', access.employee.companyId)
          .in('renewal_id', renewalIds)
          .order('created_at', { ascending: false })
          .limit(50),
  ]);
  if (profile.error || renewals.error) throw new Error('EMPLOYEE_ACTIVITY_UNAVAILABLE');
  return [
    ...(profile.data ?? []).map((row) => ({
      id: row.id as string,
      at: row.created_at as string,
      source: 'profile' as const,
      action: row.action as string,
      stage: null,
    })),
    ...((renewals.data ?? []) as Array<Record<string, string>>).map((row) => ({
      id: row.id,
      at: row.created_at,
      source: 'renewal' as const,
      action: row.action,
      stage: row.to_stage,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
    .slice(0, 50);
}

export type EmployeeTask =
  | { kind: 'document_request'; id: string; label: string; dueAt: string | null }
  | { kind: 'renewal'; id: string; label: string; dueDate: string; urgency: RenewalUrgency };

/** Own open work only: pending document requests addressed to me and my renewals needing attention. */
export async function loadEmployeeTasks(access: EmployeePortalAccess): Promise<EmployeeTask[]> {
  const admin = createSupabaseServiceRoleClient();
  const [requests, renewals] = await Promise.all([
    admin
      .from('document_requests')
      .select('id, label, due_at')
      .eq('tenant_id', access.tenant.id)
      .eq('company_id', access.employee.companyId)
      .eq('employee_id', access.employee.id)
      .eq('status', 'pending')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(100),
    ownRenewals(access),
  ]);
  if (requests.error) throw new Error('EMPLOYEE_TASKS_UNAVAILABLE');
  return [
    ...(requests.data ?? []).map((row) => ({
      kind: 'document_request' as const,
      id: row.id as string,
      label: row.label as string,
      dueAt: (row.due_at as string | null) ?? null,
    })),
    ...renewals
      .filter(
        (row) =>
          row.stage !== 'completed' && (row.urgency !== 'upcoming' || row.stage === 'in_progress'),
      )
      .map((row) => ({
        kind: 'renewal' as const,
        id: row.id,
        label: row.label,
        dueDate: row.dueDate,
        urgency: row.urgency,
      })),
  ];
}
