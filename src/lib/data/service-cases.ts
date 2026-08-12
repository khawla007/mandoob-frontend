import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/errors';
import {
  createServiceCaseSchema,
  serviceCaseFilterSchema,
  serviceCaseStatuses,
  updateServiceCaseSchema,
  type CreateServiceCaseRawInput,
  type UpdateServiceCaseRawInput,
} from '@/lib/validation/service-case';

export type ServiceCaseDeps = { supabase?: SupabaseClient };

export type ServiceCaseStatus = (typeof serviceCaseStatuses)[number];
export type ServiceCase = {
  id: string;
  tenantId: string;
  clientId: string;
  clientName: string;
  title: string;
  serviceType: string;
  status: ServiceCaseStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo: string | null;
  ownerName: string | null;
  dueAt: string | null;
  slaDueAt: string | null;
  blockedReason: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServiceCaseDbRow = {
  id: string;
  tenant_id: string;
  client_id: string;
  title: string;
  service_type: string;
  status: ServiceCaseStatus;
  priority: ServiceCase['priority'];
  assigned_to: string | null;
  due_at: string | null;
  sla_due_at: string | null;
  blocked_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceCaseOption = { id: string; name: string };
type ServiceCaseClientRow = { id: string; tenant_id: string; company_name: string };
type ServiceCaseOwnerRow = { id: string; tenant_id: string; full_name: string | null };

const SERVICE_CASE_COLUMNS =
  'id, tenant_id, client_id, title, service_type, status, priority, assigned_to, due_at, sla_due_at, blocked_reason, completed_at, created_at, updated_at';
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export const SERVICE_CASE_PAGE_SIZE = 50;
const OPTION_BATCH_SIZE = 500;

async function client(deps: ServiceCaseDeps): Promise<SupabaseClient> {
  if (deps.supabase) return deps.supabase;
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient();
}

function queryError(error: { message: string; code?: string } | null, fallback: string): void {
  if (!error) return;
  if (error.code === '42501' || error.message === 'FORBIDDEN') {
    throw new ApiError('FORBIDDEN', 'Application mutation is not authorized', 403);
  }
  if (error.code === 'P0002' || error.message === 'NOT_FOUND') {
    throw new ApiError('NOT_FOUND', 'Application not found', 404);
  }
  throw new ApiError('INTERNAL', fallback, 500, { cause: error.message });
}

function invalidInput(message: string): ApiError {
  return new ApiError('INVALID_INPUT', message, 400);
}

function assertPro(role: string): void {
  if (role !== 'pro')
    throw new ApiError('FORBIDDEN', 'Only PRO users can manage applications', 403);
}

function definedEntries<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

export function toServiceCase(
  row: ServiceCaseDbRow,
): Omit<ServiceCase, 'clientName' | 'ownerName'> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    title: row.title,
    serviceType: row.service_type,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    dueAt: row.due_at,
    slaDueAt: row.sla_due_at,
    blockedReason: row.blocked_reason,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rankServiceCases<
  T extends { id: string; priority: string; slaDueAt: string | null },
>(rows: T[], now = new Date()): T[] {
  const nowMs = now.getTime();
  return [...rows].sort((left, right) => {
    const leftSla = left.slaDueAt ? Date.parse(left.slaDueAt) : Number.POSITIVE_INFINITY;
    const rightSla = right.slaDueAt ? Date.parse(right.slaDueAt) : Number.POSITIVE_INFINITY;
    const leftBreached = leftSla < nowMs ? 0 : 1;
    const rightBreached = rightSla < nowMs ? 0 : 1;
    if (leftBreached !== rightBreached) return leftBreached - rightBreached;

    const priority = (PRIORITY_RANK[left.priority] ?? 4) - (PRIORITY_RANK[right.priority] ?? 4);
    if (priority !== 0) return priority;
    if (leftSla !== rightSla) return leftSla - rightSla;
    return left.id.localeCompare(right.id);
  });
}

function serviceCaseQuery(
  admin: SupabaseClient,
  tenantId: string,
  filters: { status?: ServiceCaseStatus[]; assigned_to?: string; client_id?: string },
  source: 'service_cases' | 'service_cases_ranked' = 'service_cases',
) {
  let query = admin
    .from(source)
    .select(SERVICE_CASE_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (filters.status?.length) query = query.in('status', filters.status);
  if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to);
  if (filters.client_id) query = query.eq('client_id', filters.client_id);
  if (source === 'service_cases_ranked') {
    return query
      .order('sla_breach_rank', { ascending: true })
      .order('priority_rank', { ascending: true })
      .order('sla_due_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });
  }
  return query.order('created_at', { ascending: false }).order('id', { ascending: true });
}

async function listAllOptionRows<T>(
  load: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  fallback: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += OPTION_BATCH_SIZE) {
    const { data, error } = await load(from, from + OPTION_BATCH_SIZE - 1);
    queryError(error, fallback);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < OPTION_BATCH_SIZE) return rows;
  }
}

function hydrateServiceCases(
  rows: ServiceCaseDbRow[],
  clients: ServiceCaseClientRow[],
  owners: ServiceCaseOwnerRow[],
  tenantId: string,
): ServiceCase[] {
  const clientNames = new Map(
    clients.filter((row) => row.tenant_id === tenantId).map((row) => [row.id, row.company_name]),
  );
  const ownerNames = new Map(
    owners.filter((row) => row.tenant_id === tenantId).map((row) => [row.id, row.full_name]),
  );
  return rankServiceCases(
    rows
      .filter((row) => row.tenant_id === tenantId)
      .map((row) => ({
        ...toServiceCase(row),
        clientName: clientNames.get(row.client_id) ?? '',
        ownerName: row.assigned_to ? (ownerNames.get(row.assigned_to) ?? null) : null,
      })),
  );
}

export async function listServiceCases(
  tenantId: string,
  filters: { status?: ServiceCaseStatus[]; assignedTo?: string; clientId?: string } = {},
  deps: ServiceCaseDeps = {},
): Promise<ServiceCase[]> {
  const parsedFilters = serviceCaseFilterSchema.safeParse({
    status: filters.status,
    assigned_to: filters.assignedTo,
    client_id: filters.clientId,
  });
  if (!parsedFilters.success) throw invalidInput(parsedFilters.error.issues[0].message);

  const admin = await client(deps);
  const [rows, clientRows, ownerRows] = await Promise.all([
    listAllOptionRows<ServiceCaseDbRow>(
      (from, to) => serviceCaseQuery(admin, tenantId, parsedFilters.data).range(from, to),
      'Could not load applications',
    ),
    listAllOptionRows<ServiceCaseClientRow>(
      (from, to) =>
        admin
          .from('clients')
          .select('id, tenant_id, company_name')
          .eq('tenant_id', tenantId)
          .order('company_name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      'Could not load application clients',
    ),
    listAllOptionRows<ServiceCaseOwnerRow>(
      (from, to) =>
        admin
          .from('profiles')
          .select('id, tenant_id, full_name')
          .eq('tenant_id', tenantId)
          .order('full_name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      'Could not load application owners',
    ),
  ]);

  return hydrateServiceCases(rows, clientRows, ownerRows, tenantId);
}

export async function listServiceCaseWorkspace(
  tenantId: string,
  filters: {
    status?: ServiceCaseStatus[];
    assignedTo?: string;
    clientId?: string;
    page?: number;
  } = {},
  deps: ServiceCaseDeps = {},
): Promise<{
  cases: ServiceCase[];
  clients: ServiceCaseOption[];
  owners: ServiceCaseOption[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const parsedFilters = serviceCaseFilterSchema.safeParse({
    status: filters.status,
    assigned_to: filters.assignedTo,
    client_id: filters.clientId,
  });
  if (!parsedFilters.success) throw invalidInput(parsedFilters.error.issues[0].message);

  const admin = await client(deps);
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const from = (page - 1) * SERVICE_CASE_PAGE_SIZE;
  const [caseResult, clientRows, ownerRows] = await Promise.all([
    serviceCaseQuery(admin, tenantId, parsedFilters.data, 'service_cases_ranked').range(
      from,
      from + SERVICE_CASE_PAGE_SIZE - 1,
    ),
    listAllOptionRows<ServiceCaseClientRow>(
      (batchFrom, batchTo) =>
        admin
          .from('clients')
          .select('id, tenant_id, company_name')
          .eq('tenant_id', tenantId)
          .order('company_name', { ascending: true })
          .order('id', { ascending: true })
          .range(batchFrom, batchTo),
      'Could not load application clients',
    ),
    listAllOptionRows<ServiceCaseOwnerRow>(
      (batchFrom, batchTo) =>
        admin
          .from('profiles')
          .select('id, tenant_id, full_name')
          .eq('tenant_id', tenantId)
          .order('full_name', { ascending: true })
          .order('id', { ascending: true })
          .range(batchFrom, batchTo),
      'Could not load application owners',
    ),
  ]);
  queryError(caseResult.error, 'Could not load applications');

  const rows = (caseResult.data ?? []) as ServiceCaseDbRow[];
  return {
    cases: hydrateServiceCases(rows, clientRows, ownerRows, tenantId),
    clients: clientRows
      .filter((row) => row.tenant_id === tenantId)
      .map((row) => ({ id: row.id, name: row.company_name })),
    owners: ownerRows
      .filter((row) => row.tenant_id === tenantId)
      .map((row) => ({ id: row.id, name: row.full_name?.trim() || row.id })),
    total: caseResult.count ?? 0,
    page,
    pageSize: SERVICE_CASE_PAGE_SIZE,
  };
}

async function belongsToTenant(
  admin: SupabaseClient,
  table: 'clients' | 'profiles',
  id: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  queryError(error, `Could not validate ${table === 'clients' ? 'client' : 'assignee'}`);
  return Boolean(data);
}

export async function createServiceCase(
  ctx: { tenantId: string; actorId: string; role: 'pro' },
  input: CreateServiceCaseRawInput,
  deps: ServiceCaseDeps = {},
): Promise<{ id: string }> {
  assertPro(ctx.role);
  const parsed = createServiceCaseSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(parsed.error.issues[0].message);
  const admin = await client(deps);

  const [validClient, validAssignee] = await Promise.all([
    belongsToTenant(admin, 'clients', parsed.data.client_id, ctx.tenantId),
    parsed.data.assigned_to
      ? belongsToTenant(admin, 'profiles', parsed.data.assigned_to, ctx.tenantId)
      : Promise.resolve(true),
  ]);
  if (!validClient)
    throw new ApiError('INVALID_CLIENT', 'Client does not belong to this tenant', 400);
  if (!validAssignee) {
    throw new ApiError('INVALID_ASSIGNEE', 'Assignee does not belong to this tenant', 400);
  }

  const values = definedEntries({
    client_id: parsed.data.client_id,
    title: parsed.data.title,
    service_type: parsed.data.service_type,
    priority: parsed.data.priority,
    assigned_to: parsed.data.assigned_to,
    due_at: parsed.data.due_at,
    sla_due_at: parsed.data.sla_due_at,
    blocked_reason: parsed.data.blocked_reason,
  });
  const changedKeys = Object.keys(values);
  const { data, error } = await admin.rpc('create_service_case_with_audit', {
    p_tenant_id: ctx.tenantId,
    p_actor_id: ctx.actorId,
    p_client_id: values.client_id,
    p_title: values.title,
    p_service_type: values.service_type,
    p_priority: values.priority,
    p_assigned_to: values.assigned_to ?? null,
    p_due_at: values.due_at ?? null,
    p_sla_due_at: values.sla_due_at ?? null,
    p_blocked_reason: values.blocked_reason ?? null,
    p_changed_keys: changedKeys,
  });
  queryError(error, 'Could not create application');
  if (typeof data !== 'string' || !data) {
    throw new ApiError('INTERNAL', 'Could not verify created application', 500);
  }
  return { id: data };
}

export async function updateServiceCase(
  ctx: { tenantId: string; actorId: string; role: 'pro' },
  id: string,
  input: UpdateServiceCaseRawInput,
  deps: ServiceCaseDeps = {},
): Promise<void> {
  assertPro(ctx.role);
  const parsed = updateServiceCaseSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(parsed.error.issues[0].message);
  const admin = await client(deps);
  const { data: current, error: readError } = await admin
    .from('service_cases')
    .select('id, tenant_id, status, completed_at')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  queryError(readError, 'Could not load application');
  if (!current || current.tenant_id !== ctx.tenantId) {
    throw new ApiError('NOT_FOUND', 'Application not found', 404);
  }

  if (
    parsed.data.assigned_to &&
    !(await belongsToTenant(admin, 'profiles', parsed.data.assigned_to, ctx.tenantId))
  ) {
    throw new ApiError('INVALID_ASSIGNEE', 'Assignee does not belong to this tenant', 400);
  }

  const nextStatus = parsed.data.status ?? (current.status as ServiceCaseStatus);
  const nextCompletedAt =
    parsed.data.completed_at !== undefined
      ? parsed.data.completed_at
      : (current.completed_at as string | null);
  if ((nextStatus === 'completed') !== (nextCompletedAt !== null)) {
    throw new ApiError(
      'INVALID_LIFECYCLE',
      'Completed applications require completed_at and other statuses must clear it',
      400,
    );
  }

  const patch = definedEntries({
    status: parsed.data.status,
    priority: parsed.data.priority,
    assigned_to: parsed.data.assigned_to,
    due_at: parsed.data.due_at,
    sla_due_at: parsed.data.sla_due_at,
    blocked_reason: parsed.data.blocked_reason,
    completed_at: parsed.data.completed_at,
  });
  const changedKeys = Object.keys(patch);
  const { data, error } = await admin.rpc('update_service_case_with_audit', {
    p_tenant_id: ctx.tenantId,
    p_actor_id: ctx.actorId,
    p_case_id: id,
    p_patch: patch,
    p_changed_keys: changedKeys,
  });
  queryError(error, 'Could not update application');
  if (data !== id) throw new ApiError('INTERNAL', 'Could not verify updated application', 500);
}

export async function listServiceCaseClients(
  tenantId: string,
  deps: ServiceCaseDeps = {},
): Promise<ServiceCaseOption[]> {
  const admin = await client(deps);
  const rows = await listAllOptionRows<ServiceCaseClientRow>(
    (from, to) =>
      admin
        .from('clients')
        .select('id, tenant_id, company_name')
        .eq('tenant_id', tenantId)
        .order('company_name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    'Could not load clients',
  );
  return rows
    .filter((row) => row.tenant_id === tenantId)
    .map((row) => ({ id: row.id, name: row.company_name }));
}

export async function listServiceCaseOwners(
  tenantId: string,
  deps: ServiceCaseDeps = {},
): Promise<ServiceCaseOption[]> {
  const admin = await client(deps);
  const rows = await listAllOptionRows<ServiceCaseOwnerRow>(
    (from, to) =>
      admin
        .from('profiles')
        .select('id, tenant_id, full_name')
        .eq('tenant_id', tenantId)
        .order('full_name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    'Could not load owners',
  );
  return rows
    .filter((row) => row.tenant_id === tenantId)
    .map((row) => ({ id: row.id, name: row.full_name?.trim() || row.id }));
}
