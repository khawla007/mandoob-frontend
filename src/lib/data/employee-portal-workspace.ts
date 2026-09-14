import 'server-only';

import type { SessionProfile } from '@/lib/auth/require-user';
import { decryptOptional } from '@/lib/crypto/pii';
import { signalBusinessDate, signalDaysBetween } from '@/lib/data/signal-finance';
import type { Tenant } from '@/lib/data/tenant';
import type { RenewalStatus, RenewalType } from '@/lib/data/renewals';
import { ApiError } from '@/lib/errors';

const ROW_LIMIT = 50;

export const EMPLOYEE_SIGNAL_ORDER = ['visa', 'emirates-id', 'renewal', 'documents'] as const;

export type EmployeeDeadline =
  | { kind: 'missing-date'; daysOut: null }
  | {
      kind:
        | 'overdue'
        | 'due-today'
        | 'due-soon'
        | 'future'
        | 'completed'
        | 'cancelled'
        | 'status-conflict';
      daysOut: number | null;
    };

export type EmployeeSourceState<T> =
  | { kind: 'ready'; value: T }
  | { kind: 'empty'; value: T }
  | { kind: 'error' }
  | { kind: 'unavailable' };

export type EmployeeCompanyDisplay =
  | { kind: 'active'; name: string | null }
  | { kind: 'inactive'; name: null };

export type EmployeeDisplay = {
  id: string;
  companyId: string;
  name: string | null;
  nationality: string | null;
  passportMasked: string | null;
  visaMasked: string | null;
  visaExpiry: string | null;
  emiratesIdMasked: string | null;
  eidExpiry: string | null;
};

export type EmployeePortalAccess = {
  tenant: Tenant;
  session: SessionProfile & { role: 'employee'; tenantId: string };
  employee: EmployeeDisplay;
  company: EmployeeCompanyDisplay | null;
};

export type EmployeeAccessRow = {
  id: string;
  tenantId: string;
  companyId: string;
  profileId: string | null;
  status: string;
  name?: string;
  nationality?: string | null;
  passportNo?: string | null;
  visaNo?: string | null;
  visaExpiry?: string | null;
  emiratesId?: string | null;
  eidExpiry?: string | null;
  company?: { id: string; tenantId: string; name: string | null; status: string | null } | null;
};

export type EmployeePortalAccessDependencies = {
  requireRouteAccess?: (slug: string) => Promise<{ tenant: Tenant; session: SessionProfile }>;
  requireActiveTenant?: (tenantId: string) => Promise<unknown>;
  readEmployee?: (profileId: string, tenantId: string) => Promise<EmployeeAccessRow | null>;
  deny?: () => never;
};

export function maskEmployeeIdentifier(value: string | null | undefined): string | null {
  const normalized = value?.replace(/[^\p{L}\p{N}]/gu, '').trim();
  if (!normalized) return null;
  return `•••• ${normalized.slice(-4)}`;
}

function strictDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function classifyEmployeeDeadline(
  dueDate: string | null,
  status: RenewalStatus | 'identity-date' = 'upcoming',
  today = signalBusinessDate(),
): EmployeeDeadline {
  if (status === 'completed' || status === 'cancelled') return { kind: status, daysOut: null };
  if (!strictDate(dueDate)) return { kind: 'missing-date', daysOut: null };
  const daysOut = signalDaysBetween(today, dueDate);
  if (status === 'overdue' && daysOut >= 0) return { kind: 'status-conflict', daysOut };
  if (daysOut < 0) return { kind: 'overdue', daysOut };
  if (daysOut === 0) return { kind: 'due-today', daysOut };
  if (daysOut <= 30) return { kind: 'due-soon', daysOut };
  return { kind: 'future', daysOut };
}

export type EmployeePortalRoute =
  | 'dashboard'
  | 'profile'
  | 'identity'
  | 'documents'
  | 'renewals'
  | 'settings'
  | 'security';

export function employeePortalHref(
  slug: string,
  route: EmployeePortalRoute,
  anchor?: string,
): string {
  const leaf = route === 'security' ? 'settings/security' : route;
  const hash = anchor ? `#${encodeURIComponent(anchor)}` : '';
  return `/t/${encodeURIComponent(slug)}/employee/${leaf}${hash}`;
}

async function deny(dependencies: EmployeePortalAccessDependencies): Promise<never> {
  if (dependencies.deny) return dependencies.deny();
  const { notFound } = await import('next/navigation');
  notFound();
  throw new Error('UNREACHABLE_NOT_FOUND');
}

async function defaultRequireRouteAccess(slug: string) {
  const { requireTenantRouteAccess } = await import('@/lib/auth/require-tenant-route-access');
  return requireTenantRouteAccess(slug, ['employee']);
}

async function defaultRequireActiveTenant(tenantId: string) {
  const { requireActiveTenant } = await import('@/lib/auth/require-active-tenant');
  return requireActiveTenant(tenantId);
}

async function defaultReadEmployee(
  profileId: string,
  tenantId: string,
): Promise<EmployeeAccessRow | null> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('employees')
    .select(
      'id, tenant_id, company_id, profile_id, status, name, nationality, passport_no_encrypted, visa_no_encrypted, visa_expiry, emirates_id_encrypted, eid_expiry, company:company_profiles!employees_company_tenant_fk(id, tenant_id, company_name, status)',
    )
    .eq('profile_id', profileId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Employee record unavailable', 500);
  if (!data) return null;
  const joined = Array.isArray(data.company) ? data.company[0] : data.company;
  return {
    id: data.id,
    tenantId: data.tenant_id,
    companyId: data.company_id,
    profileId: data.profile_id,
    status: data.status,
    name: data.name,
    nationality: data.nationality,
    passportNo: decryptOptional(data.passport_no_encrypted),
    visaNo: decryptOptional(data.visa_no_encrypted),
    visaExpiry: data.visa_expiry,
    emiratesId: decryptOptional(data.emirates_id_encrypted),
    eidExpiry: data.eid_expiry,
    company: joined
      ? {
          id: joined.id,
          tenantId: joined.tenant_id,
          name: joined.company_name,
          status: joined.status,
        }
      : null,
  };
}

/** Direct page/read boundary for the active Employee's own record and Company. */
export async function authorizeEmployeePortalRead(
  tenantSlug: string,
  expectedActorId?: string,
  dependencies: EmployeePortalAccessDependencies = {},
): Promise<EmployeePortalAccess> {
  const { tenant, session } = await (dependencies.requireRouteAccess ?? defaultRequireRouteAccess)(
    tenantSlug,
  );
  await (dependencies.requireActiveTenant ?? defaultRequireActiveTenant)(tenant.id);
  if (
    session.role !== 'employee' ||
    session.tenantId !== tenant.id ||
    (expectedActorId !== undefined && expectedActorId !== session.id)
  ) {
    return deny(dependencies);
  }
  const row = await (dependencies.readEmployee ?? defaultReadEmployee)(session.id, tenant.id);
  if (
    !row ||
    row.status !== 'active' ||
    row.profileId !== session.id ||
    row.tenantId !== tenant.id ||
    !row.companyId
  ) {
    return deny(dependencies);
  }
  const company = row.company;
  if (company && (company.id !== row.companyId || company.tenantId !== tenant.id)) {
    return deny(dependencies);
  }
  return {
    tenant,
    session: { ...session, role: 'employee', tenantId: tenant.id },
    employee: {
      id: row.id,
      companyId: row.companyId,
      name: row.name?.trim() || null,
      nationality: row.nationality?.trim() || null,
      passportMasked: maskEmployeeIdentifier(row.passportNo),
      visaMasked: maskEmployeeIdentifier(row.visaNo),
      visaExpiry: strictDate(row.visaExpiry ?? null) ? (row.visaExpiry ?? null) : null,
      emiratesIdMasked: maskEmployeeIdentifier(row.emiratesId),
      eidExpiry: strictDate(row.eidExpiry ?? null) ? (row.eidExpiry ?? null) : null,
    },
    company: company
      ? company.status === 'active'
        ? { kind: 'active', name: company.name?.trim() || null }
        : { kind: 'inactive', name: null }
      : null,
  };
}

export type EmployeeAssignmentState =
  | {
      kind: 'active';
      value: { name: string | null; title: string | null; contact: { kind: 'unavailable' } };
    }
  | { kind: 'missing' | 'released' | 'unavailable' | 'error' };

export async function loadEmployeeAssignment(
  access: EmployeePortalAccess,
): Promise<EmployeeAssignmentState> {
  if (access.company?.kind !== 'active') return { kind: 'unavailable' };
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  try {
    const { data: active, error } = await admin
      .from('pro_company_assignments')
      .select('id, tenant_id, company_id, pro_profile_id, status')
      .eq('tenant_id', access.tenant.id)
      .eq('company_id', access.employee.companyId)
      .eq('status', 'active')
      .order('assigned_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(2);
    if (error || !active || active.length > 1) return { kind: 'error' };
    const assignment = active[0];
    if (!assignment) {
      const { data: released, error: releasedError } = await admin
        .from('pro_company_assignments')
        .select('id, tenant_id, company_id, status')
        .eq('tenant_id', access.tenant.id)
        .eq('company_id', access.employee.companyId)
        .eq('status', 'released')
        .limit(1);
      if (
        releasedError ||
        released?.some(
          (row) =>
            row.tenant_id !== access.tenant.id ||
            row.company_id !== access.employee.companyId ||
            row.status !== 'released',
        )
      )
        return { kind: 'error' };
      return { kind: released?.length ? 'released' : 'missing' };
    }
    if (
      assignment.tenant_id !== access.tenant.id ||
      assignment.company_id !== access.employee.companyId ||
      assignment.status !== 'active'
    )
      return { kind: 'error' };
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, tenant_id, role, status, full_name, title')
      .eq('id', assignment.pro_profile_id)
      .eq('tenant_id', access.tenant.id)
      .eq('role', 'pro')
      .eq('status', 'active')
      .maybeSingle();
    if (
      profileError ||
      !profile ||
      profile.id !== assignment.pro_profile_id ||
      profile.tenant_id !== access.tenant.id ||
      profile.role !== 'pro' ||
      profile.status !== 'active'
    ) {
      return { kind: 'error' };
    }
    return {
      kind: 'active',
      value: {
        name: profile.full_name?.trim() || null,
        title: profile.title?.trim() || null,
        contact: { kind: 'unavailable' },
      },
    };
  } catch {
    return { kind: 'error' };
  }
}

export type EmployeeDocumentRequest = {
  id: string;
  docType: string;
  label: string;
  instructions: string | null;
  dueDate: string | null;
  status: string;
};

export type EmployeeDocumentRow = {
  id: string;
  requestId: string | null;
  versionId: string | null;
  docType: string;
  label: string;
  reviewStatus: string | null;
  rejectionInstruction: string | null;
  uploadedAt: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  scanStatus: 'unavailable';
};

export type EmployeeDocumentWorkspace = {
  requests: EmployeeSourceState<EmployeeDocumentRequest[]>;
  documents: EmployeeSourceState<EmployeeDocumentRow[]>;
  awaitingActionCount: number | null;
  summaries: { underReview: number | null; approved: number | null; rejected: number | null };
  hasMore: boolean;
  upload: 'phase-3-unavailable';
};

export async function loadEmployeeDocuments(
  access: EmployeePortalAccess,
): Promise<EmployeeDocumentWorkspace> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  const scope = {
    tenantId: access.tenant.id,
    companyId: access.employee.companyId,
    employeeId: access.employee.id,
  };
  const requestPromise = admin
    .from('document_requests')
    .select(
      'id, tenant_id, company_id, employee_id, doc_type, label, notes, due_at, status, created_at',
    )
    .eq('tenant_id', scope.tenantId)
    .eq('company_id', scope.companyId)
    .eq('employee_id', scope.employeeId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(ROW_LIMIT + 1);
  const documentPromise = admin
    .from('documents')
    .select(
      'id, tenant_id, company_id, employee_id, request_id, doc_type, label, updated_at, currentVersion:document_versions!documents_current_version_fk(id, review_status, reviewed_at, created_at, mime_type, size_bytes)',
    )
    .eq('tenant_id', scope.tenantId)
    .eq('company_id', scope.companyId)
    .eq('employee_id', scope.employeeId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(ROW_LIMIT + 1);
  const [requestResult, documentResult] = await Promise.allSettled([
    requestPromise,
    documentPromise,
  ]);
  let requests: EmployeeSourceState<EmployeeDocumentRequest[]> = { kind: 'error' };
  let documents: EmployeeSourceState<EmployeeDocumentRow[]> = { kind: 'error' };
  let requestHasMore = false;
  let documentHasMore = false;
  if (requestResult.status === 'fulfilled' && !requestResult.value.error) {
    const rows = requestResult.value.data ?? [];
    if (
      rows.some(
        (row) =>
          row.tenant_id !== scope.tenantId ||
          row.company_id !== scope.companyId ||
          row.employee_id !== scope.employeeId,
      )
    )
      return {
        requests: { kind: 'error' },
        documents: { kind: 'error' },
        awaitingActionCount: null,
        summaries: { underReview: null, approved: null, rejected: null },
        hasMore: false,
        upload: 'phase-3-unavailable',
      };
    requestHasMore = rows.length > ROW_LIMIT;
    const mapped = rows.slice(0, ROW_LIMIT).map((row) => ({
      id: row.id,
      docType: row.doc_type,
      label: row.label?.trim() || row.doc_type.replaceAll('_', ' '),
      instructions: row.notes?.trim().slice(0, 500) || null,
      dueDate: strictDate(row.due_at?.slice(0, 10) ?? null) ? row.due_at.slice(0, 10) : null,
      status: row.status,
    }));
    requests = { kind: mapped.length ? 'ready' : 'empty', value: mapped };
  }
  if (documentResult.status === 'fulfilled' && !documentResult.value.error) {
    const rows = documentResult.value.data ?? [];
    if (
      rows.some(
        (row) =>
          row.tenant_id !== scope.tenantId ||
          row.company_id !== scope.companyId ||
          row.employee_id !== scope.employeeId,
      )
    )
      return {
        requests,
        documents: { kind: 'error' },
        awaitingActionCount: null,
        summaries: { underReview: null, approved: null, rejected: null },
        hasMore: requestHasMore,
        upload: 'phase-3-unavailable',
      };
    documentHasMore = rows.length > ROW_LIMIT;
    const mapped = rows.slice(0, ROW_LIMIT).map((row) => {
      const version = Array.isArray(row.currentVersion)
        ? row.currentVersion[0]
        : row.currentVersion;
      return {
        id: row.id,
        requestId: row.request_id,
        versionId: version?.id ?? null,
        docType: row.doc_type,
        label: row.label?.trim() || row.doc_type.replaceAll('_', ' '),
        reviewStatus: version?.review_status ?? null,
        // Existing review notes have no Employee-visible marker, so keep them server-private.
        rejectionInstruction: null,
        uploadedAt: version?.created_at ?? null,
        mimeType: version?.mime_type ?? null,
        sizeBytes: version?.size_bytes ?? null,
        scanStatus: 'unavailable' as const,
      };
    });
    documents = { kind: mapped.length ? 'ready' : 'empty', value: mapped };
  }
  const requestRows =
    requests.kind === 'ready' || requests.kind === 'empty' ? requests.value : null;
  const documentRows =
    documents.kind === 'ready' || documents.kind === 'empty' ? documents.value : null;
  const awaitingActionCount =
    requestRows && documentRows && !requestHasMore && !documentHasMore
      ? requestRows.filter(
          (request) =>
            request.status === 'pending' &&
            !documentRows?.some(
              (document) => document.requestId === request.id && document.versionId,
            ),
        ).length
      : null;
  const countStatus = (status: string) =>
    documentRows && !documentHasMore
      ? documentRows.filter((document) => document.reviewStatus === status).length
      : null;
  return {
    requests,
    documents,
    awaitingActionCount,
    summaries: {
      underReview: countStatus('pending'),
      approved: countStatus('approved'),
      rejected: countStatus('rejected'),
    },
    hasMore: requestHasMore || documentHasMore,
    upload: 'phase-3-unavailable',
  };
}

export type EmployeeRenewalRow = {
  id: string;
  type: RenewalType | 'passport';
  label: string;
  dueDate: string | null;
  status: RenewalStatus | 'identity-date';
  deadline: EmployeeDeadline;
  source: 'renewal' | 'identity-date';
};

export type EmployeeRenewalWorkspace = {
  kind: 'ready' | 'empty' | 'error';
  value: EmployeeRenewalRow[];
  nearest: EmployeeRenewalRow | null;
  hasMore: boolean;
  summaries: {
    overdue: number | null;
    dueSoon: number | null;
    upcoming: number | null;
    completed: number | null;
  };
};

export async function loadEmployeeRenewals(
  access: EmployeePortalAccess,
  today = signalBusinessDate(),
): Promise<EmployeeRenewalWorkspace> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  try {
    const admin = createSupabaseServiceRoleClient();
    const listQuery = admin
      .from('renewals')
      .select('id, tenant_id, company_id, employee_id, type, label, due_date, status')
      .eq('tenant_id', access.tenant.id)
      .eq('company_id', access.employee.companyId)
      .eq('employee_id', access.employee.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(ROW_LIMIT + 1);
    const nearestQuery = admin
      .from('renewals')
      .select('id, tenant_id, company_id, employee_id, type, label, due_date, status')
      .eq('tenant_id', access.tenant.id)
      .eq('company_id', access.employee.companyId)
      .eq('employee_id', access.employee.id)
      .in('status', ['upcoming', 'due_soon', 'overdue'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(1);
    const [{ data, error }, { data: nearestData, error: nearestError }] = await Promise.all([
      listQuery,
      nearestQuery,
    ]);
    if (error || nearestError)
      return {
        kind: 'error',
        value: [],
        nearest: null,
        hasMore: false,
        summaries: { overdue: null, dueSoon: null, upcoming: null, completed: null },
      };
    const owned = data ?? [];
    const nearestOwned = nearestData ?? [];
    if (
      [...owned, ...nearestOwned].some(
        (row) =>
          row.tenant_id !== access.tenant.id ||
          row.company_id !== access.employee.companyId ||
          row.employee_id !== access.employee.id,
      )
    )
      return {
        kind: 'error',
        value: [],
        nearest: null,
        hasMore: false,
        summaries: { overdue: null, dueSoon: null, upcoming: null, completed: null },
      };
    const rows: EmployeeRenewalRow[] = owned.slice(0, ROW_LIMIT).map((row) => ({
      id: row.id,
      type: row.type,
      label: row.label,
      dueDate: strictDate(row.due_date) ? row.due_date : null,
      status: row.status,
      deadline: classifyEmployeeDeadline(
        strictDate(row.due_date) ? row.due_date : null,
        row.status,
        today,
      ),
      source: 'renewal',
    }));
    const nearestLive = nearestOwned[0];
    if (nearestLive && !rows.some((row) => row.id === nearestLive.id)) {
      rows.push({
        id: nearestLive.id,
        type: nearestLive.type,
        label: nearestLive.label,
        dueDate: strictDate(nearestLive.due_date) ? nearestLive.due_date : null,
        status: nearestLive.status,
        deadline: classifyEmployeeDeadline(
          strictDate(nearestLive.due_date) ? nearestLive.due_date : null,
          nearestLive.status,
          today,
        ),
        source: 'renewal',
      });
    }
    for (const fallback of [
      { type: 'visa' as const, dueDate: access.employee.visaExpiry },
      { type: 'eid' as const, dueDate: access.employee.eidExpiry },
    ]) {
      if (fallback.dueDate && !rows.some((row) => row.type === fallback.type)) {
        rows.push({
          id: `identity-${fallback.type}`,
          type: fallback.type,
          label: '',
          dueDate: fallback.dueDate,
          status: 'identity-date',
          deadline: classifyEmployeeDeadline(fallback.dueDate, 'identity-date', today),
          source: 'identity-date',
        });
      }
    }
    rows.sort((a, b) =>
      a.dueDate === b.dueDate
        ? a.id.localeCompare(b.id)
        : (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
    );
    const hasMore = owned.length > ROW_LIMIT;
    const liveRows = rows.filter((row) => row.source === 'renewal');
    const summaries = hasMore
      ? { overdue: null, dueSoon: null, upcoming: null, completed: null }
      : {
          overdue: liveRows.filter((row) => row.deadline.kind === 'overdue').length,
          dueSoon: liveRows.filter(
            (row) => row.deadline.kind === 'due-today' || row.deadline.kind === 'due-soon',
          ).length,
          upcoming: liveRows.filter((row) => row.deadline.kind === 'future').length,
          completed: liveRows.filter((row) => row.deadline.kind === 'completed').length,
        };
    const nearest =
      liveRows.find(
        (row) =>
          row.deadline.kind !== 'completed' &&
          row.deadline.kind !== 'cancelled' &&
          row.deadline.kind !== 'missing-date',
      ) ?? null;
    return {
      kind: rows.length ? 'ready' : 'empty',
      value: rows,
      nearest,
      hasMore,
      summaries,
    };
  } catch {
    return {
      kind: 'error',
      value: [],
      nearest: null,
      hasMore: false,
      summaries: { overdue: null, dueSoon: null, upcoming: null, completed: null },
    };
  }
}

async function loadEmployeePreference(access: EmployeePortalAccess) {
  const { getEmployeeNotificationPreferences } = await import('@/lib/data/employee-portal');
  return getEmployeeNotificationPreferences(access.session.id, access.tenant.id);
}

type EmployeeOverviewDependencies = {
  loadAssignment?: (access: EmployeePortalAccess) => Promise<EmployeeAssignmentState>;
  loadDocuments?: (access: EmployeePortalAccess) => Promise<EmployeeDocumentWorkspace>;
  loadRenewals?: (access: EmployeePortalAccess) => Promise<EmployeeRenewalWorkspace>;
  loadPreference?: (
    access: EmployeePortalAccess,
  ) => Promise<{ renewalRemindersEnabled: boolean | null }>;
};

async function settle<T>(promise: Promise<T>): Promise<EmployeeSourceState<T>> {
  try {
    return { kind: 'ready', value: await promise };
  } catch {
    return { kind: 'error' };
  }
}

export async function loadEmployeeOverview(
  access: EmployeePortalAccess,
  dependencies: EmployeeOverviewDependencies = {},
) {
  const [assignment, documents, renewals, preference] = await Promise.all([
    settle((dependencies.loadAssignment ?? loadEmployeeAssignment)(access)),
    settle((dependencies.loadDocuments ?? loadEmployeeDocuments)(access)),
    settle((dependencies.loadRenewals ?? loadEmployeeRenewals)(access)),
    settle((dependencies.loadPreference ?? loadEmployeePreference)(access)),
  ]);
  return {
    assignment: assignment.kind === 'ready' ? assignment.value : assignment,
    documents: documents.kind === 'ready' ? documents.value : documents,
    renewals: renewals.kind === 'ready' ? renewals.value : renewals,
    preference,
    notifications: { kind: 'unavailable' as const },
    generatedAt: new Date().toISOString(),
  };
}
