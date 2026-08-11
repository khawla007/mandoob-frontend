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

const SERVICE_CASE_COLUMNS =
  'id, tenant_id, client_id, title, service_type, status, priority, assigned_to, due_at, sla_due_at, blocked_reason, completed_at, created_at, updated_at';
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

async function client(deps: ServiceCaseDeps): Promise<SupabaseClient> {
  if (deps.supabase) return deps.supabase;
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient();
}

function queryError(error: { message: string } | null, fallback: string): void {
  if (error) throw new ApiError('INTERNAL', fallback, 500, { cause: error.message });
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
  let query = admin.from('service_cases').select(SERVICE_CASE_COLUMNS).eq('tenant_id', tenantId);
  if (parsedFilters.data.status?.length) query = query.in('status', parsedFilters.data.status);
  if (parsedFilters.data.assigned_to) {
    query = query.eq('assigned_to', parsedFilters.data.assigned_to);
  }
  if (parsedFilters.data.client_id) query = query.eq('client_id', parsedFilters.data.client_id);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(250);
  queryError(error, 'Could not load applications');
  const rows = ((data ?? []) as ServiceCaseDbRow[]).filter((row) => row.tenant_id === tenantId);
  const clientIds = [...new Set(rows.map((row) => row.client_id))];
  const ownerIds = [...new Set(rows.flatMap((row) => (row.assigned_to ? [row.assigned_to] : [])))];

  const [clientResult, ownerResult] = await Promise.all([
    clientIds.length
      ? admin
          .from('clients')
          .select('id, tenant_id, company_name')
          .eq('tenant_id', tenantId)
          .in('id', clientIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? admin
          .from('profiles')
          .select('id, tenant_id, full_name')
          .eq('tenant_id', tenantId)
          .in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  queryError(clientResult.error, 'Could not load application clients');
  queryError(ownerResult.error, 'Could not load application owners');

  const clientNames = new Map(
    ((clientResult.data ?? []) as Array<{ id: string; tenant_id: string; company_name: string }>)
      .filter((row) => row.tenant_id === tenantId)
      .map((row) => [row.id, row.company_name]),
  );
  const ownerNames = new Map(
    ((ownerResult.data ?? []) as Array<{ id: string; tenant_id: string; full_name: string | null }>)
      .filter((row) => row.tenant_id === tenantId)
      .map((row) => [row.id, row.full_name]),
  );

  return rankServiceCases(
    rows.map((row) => ({
      ...toServiceCase(row),
      clientName: clientNames.get(row.client_id) ?? '',
      ownerName: row.assigned_to ? (ownerNames.get(row.assigned_to) ?? null) : null,
    })),
  );
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

async function recordAudit(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    actorId: string;
    action: 'service_case_created' | 'service_case_updated';
    id: string;
    changedKeys: string[];
  },
): Promise<void> {
  const { error } = await admin.from('tenant_audit_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    action: input.action,
    source: 'self_serve',
    details: { entity: 'service_case', id: input.id, changed_keys: input.changedKeys },
  });
  queryError(error, 'Could not record application audit');
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
  const { data, error } = await admin
    .from('service_cases')
    .insert({ tenant_id: ctx.tenantId, created_by: ctx.actorId, ...values })
    .select('id')
    .single();
  queryError(error, 'Could not create application');
  if (!data?.id) throw new ApiError('INTERNAL', 'Could not create application', 500);
  const id = data.id as string;
  await recordAudit(admin, {
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    action: 'service_case_created',
    id,
    changedKeys: Object.keys(values),
  });
  return { id };
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
  const { error } = await admin
    .from('service_cases')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  queryError(error, 'Could not update application');
  await recordAudit(admin, {
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    action: 'service_case_updated',
    id,
    changedKeys: Object.keys(patch),
  });
}

export async function listServiceCaseClients(
  tenantId: string,
  deps: ServiceCaseDeps = {},
): Promise<ServiceCaseOption[]> {
  const { data, error } = await (await client(deps))
    .from('clients')
    .select('id, tenant_id, company_name')
    .eq('tenant_id', tenantId)
    .order('company_name', { ascending: true })
    .limit(250);
  queryError(error, 'Could not load clients');
  return ((data ?? []) as Array<{ id: string; tenant_id: string; company_name: string }>)
    .filter((row) => row.tenant_id === tenantId)
    .map((row) => ({ id: row.id, name: row.company_name }));
}

export async function listServiceCaseOwners(
  tenantId: string,
  deps: ServiceCaseDeps = {},
): Promise<ServiceCaseOption[]> {
  const { data, error } = await (await client(deps))
    .from('profiles')
    .select('id, tenant_id, full_name')
    .eq('tenant_id', tenantId)
    .order('full_name', { ascending: true })
    .limit(250);
  queryError(error, 'Could not load owners');
  return ((data ?? []) as Array<{ id: string; tenant_id: string; full_name: string | null }>)
    .filter((row) => row.tenant_id === tenantId)
    .map((row) => ({ id: row.id, name: row.full_name?.trim() || row.id }));
}
