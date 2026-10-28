import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { SessionProfile } from '@/lib/auth/require-user';
import type { EmployeePortalAccess } from '@/lib/data/employee-portal-workspace';
import type { CustomerCompanyAccess } from '@/lib/data/customer-company-access';

export const OPERATIONAL_PAGE_SIZE = 25;

export type OperationalRuntimeRole = 'admin' | 'pro' | 'customer' | 'employee';
export type OperationalRuntimeModule = 'communications' | 'notifications' | 'tasks' | 'activity';
export type OperationalSearch = Record<string, string | string[] | undefined>;

type RuntimeRpcName =
  | 'list_operational_notifications'
  | 'list_operational_tasks'
  | 'list_operational_activity'
  | 'set_operational_notification_read_state';

type RuntimeRpcClient = {
  rpc(
    name: RuntimeRpcName,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>;
};

type OperationalScope = {
  actorId: string;
  companyId: string;
  tenantId: string | null;
};

type OperationalDependencies = {
  client?: RuntimeRpcClient;
  authorizeAdmin?: () => Promise<SessionProfile>;
  authorizePro?: (slug: string) => Promise<{
    tenant: { id: string };
    session: SessionProfile & { role: 'pro'; tenantId: string };
  }>;
  readProCompany?: (
    actorId: string,
    slug: string,
  ) => Promise<{ id: string; tenantId: string } | null>;
  authorizeCustomer?: (slug: string) => Promise<CustomerCompanyAccess>;
  authorizeEmployee?: (slug: string) => Promise<EmployeePortalAccess>;
  logFailure?: (event: OperationalFailureDiagnostic) => void;
};

export type OperationalFailureDiagnostic = {
  event: 'operational-runtime.failure';
  category: 'authorization' | 'rpc' | 'schema';
  operation: 'load' | 'mutation';
  module: OperationalRuntimeModule;
  role: OperationalRuntimeRole;
};

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const metadata = z.record(z.string(), z.unknown()).default({});

const notificationRow = z.object({
  id: uuid,
  recipient_profile_id: uuid,
  notification_code: z.string().min(1).max(64),
  severity: z.enum(['info', 'success', 'warning', 'critical']),
  safe_metadata: metadata,
  read_at: timestamp.nullable(),
  created_at: timestamp,
});

const taskRow = z.object({
  id: uuid,
  assigned_profile_id: uuid.nullable(),
  task_code: z.string().min(1).max(64),
  state: z.enum(['open', 'in_progress', 'done', 'cancelled']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  due_at: timestamp.nullable(),
  safe_metadata: metadata,
  created_at: timestamp,
});

const activityRow = z.object({
  id: uuid,
  actor_profile_id: uuid.nullable(),
  activity_code: z.string().min(1).max(64),
  safe_metadata: metadata,
  created_at: timestamp,
});

export type OperationalRuntimeItem =
  | {
      kind: 'notification';
      id: string;
      code: string;
      severity: 'info' | 'success' | 'warning' | 'critical';
      read: boolean;
      canSetReadState: boolean;
      createdAt: string;
    }
  | {
      kind: 'task';
      id: string;
      code: string;
      state: 'open' | 'in_progress' | 'done' | 'cancelled';
      priority: 'low' | 'normal' | 'high' | 'urgent';
      dueAt: string | null;
      createdAt: string;
    }
  | { kind: 'activity'; id: string; code: string; createdAt: string };

export type OperationalRuntimeModel =
  | { state: 'scope-required'; channelState: 'disabled'; items: [] }
  | { state: 'unavailable'; channelState: 'disabled'; items: [] }
  | {
      state: 'error';
      code: 'unavailable';
      channelState: 'disabled';
      items: [];
      retryHref: string;
    }
  | {
      state: 'empty' | 'data';
      channelState: 'disabled';
      items: OperationalRuntimeItem[];
      nextHref: string | null;
    };

export type LoadOperationalRuntimeInput = {
  role: OperationalRuntimeRole;
  module: OperationalRuntimeModule;
  tenantSlug?: string;
  requestedCompanyId?: string;
  baseHref: string;
  search?: OperationalSearch;
};

export function sanitizeOperationalError(): { code: 'unavailable' } {
  return { code: 'unavailable' };
}

function reportOperationalFailure(
  dependencies: OperationalDependencies,
  diagnostic: Omit<OperationalFailureDiagnostic, 'event'>,
): void {
  const event: OperationalFailureDiagnostic = {
    event: 'operational-runtime.failure',
    ...diagnostic,
  };
  try {
    (dependencies.logFailure ?? console.error)(event);
  } catch {
    // Diagnostics must never widen or replace the sanitized operational result.
  }
}

function operationalError(retryHref: string): Extract<OperationalRuntimeModel, { state: 'error' }> {
  return {
    state: 'error',
    ...sanitizeOperationalError(),
    channelState: 'disabled',
    items: [],
    retryHref,
  };
}

async function rpcClient(dependencies: OperationalDependencies): Promise<RuntimeRpcClient> {
  if (dependencies.client) return dependencies.client;
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  return (await createSupabaseServerClient()) as unknown as RuntimeRpcClient;
}

async function resolveOperationalScope(
  input: Pick<LoadOperationalRuntimeInput, 'role' | 'tenantSlug' | 'requestedCompanyId'>,
  dependencies: OperationalDependencies,
): Promise<OperationalScope | null> {
  if (input.role === 'admin') {
    const authorizeAdmin =
      dependencies.authorizeAdmin ??
      (await import('@/lib/auth/require-role')).requirePlatformOperator;
    const session = await authorizeAdmin();
    const companyId = uuid.safeParse(input.requestedCompanyId);
    if (!companyId.success) return null;
    return { actorId: session.id, companyId: companyId.data, tenantId: null };
  }

  const slug = input.tenantSlug?.trim();
  if (!slug) throw new Error('OPERATIONAL_ACCESS_DENIED');

  if (input.role === 'pro') {
    const authorizePro =
      dependencies.authorizePro ??
      (await import('@/lib/auth/require-tenant-route-access')).requireProTenantRouteAccess;
    const readProCompany =
      dependencies.readProCompany ??
      (await import('@/lib/data/company-profile')).readAssignedCompanyForPro;
    const { tenant, session } = await authorizePro(slug);
    const company = await readProCompany(session.id, slug);
    if (!company || company.tenantId !== tenant.id) throw new Error('OPERATIONAL_ACCESS_DENIED');
    return { actorId: session.id, companyId: company.id, tenantId: tenant.id };
  }

  if (input.role === 'customer') {
    const authorizeCustomer =
      dependencies.authorizeCustomer ??
      (await import('@/lib/data/customer-company-access'))
        .requireAuthorizedCustomerLinkedCompanyRead;
    const access = await authorizeCustomer(slug);
    if (access.kind !== 'authorized' || access.company.tenantId !== access.tenant.id) {
      throw new Error('OPERATIONAL_ACCESS_DENIED');
    }
    return {
      actorId: access.session.id,
      companyId: access.company.id,
      tenantId: access.tenant.id,
    };
  }

  const authorizeEmployee =
    dependencies.authorizeEmployee ??
    (await import('@/lib/data/employee-portal-workspace')).authorizeEmployeePortalRead;
  const access = await authorizeEmployee(slug);
  if (access.session.tenantId !== access.tenant.id) throw new Error('OPERATIONAL_ACCESS_DENIED');
  return {
    actorId: access.session.id,
    companyId: access.employee.companyId,
    tenantId: access.tenant.id,
  };
}

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function cursor(search: OperationalSearch): { createdAt: string; id: string } | null {
  const createdAt = one(search.before);
  const id = one(search.beforeId);
  const parsedCreatedAt = timestamp.safeParse(createdAt);
  const parsedId = uuid.safeParse(id);
  return parsedCreatedAt.success && parsedId.success
    ? { createdAt: parsedCreatedAt.data, id: parsedId.data }
    : null;
}

function operationalHref(
  baseHref: string,
  companyId: string | undefined,
  before: { createdAt: string; id: string } | null,
): string {
  const query = new URLSearchParams();
  if (companyId) query.set('companyId', companyId);
  if (before) {
    query.set('before', before.createdAt);
    query.set('beforeId', before.id);
  }
  const suffix = query.toString();
  return suffix ? `${baseHref}?${suffix}` : baseHref;
}

export async function loadOperationalWorkspace(
  input: LoadOperationalRuntimeInput,
  dependencies: OperationalDependencies = {},
): Promise<OperationalRuntimeModel> {
  let retryHref = input.baseHref;
  let scope: OperationalScope | null;
  try {
    scope = await resolveOperationalScope(input, dependencies);
  } catch {
    reportOperationalFailure(dependencies, {
      category: 'authorization',
      operation: 'load',
      module: input.module,
      role: input.role,
    });
    return operationalError(retryHref);
  }
  if (!scope) return { state: 'scope-required', channelState: 'disabled', items: [] };
  if (input.module === 'communications') {
    return { state: 'unavailable', channelState: 'disabled', items: [] };
  }

  const search = input.search ?? {};
  const before = cursor(search);
  const scopedCompanyId = input.role === 'admin' ? scope.companyId : undefined;
  retryHref = operationalHref(input.baseHref, scopedCompanyId, before);
  const name = {
    notifications: 'list_operational_notifications',
    tasks: 'list_operational_tasks',
    activity: 'list_operational_activity',
  }[input.module] as Exclude<RuntimeRpcName, 'set_operational_notification_read_state'>;
  let response: { data: unknown; error: unknown | null };
  try {
    response = await (
      await rpcClient(dependencies)
    ).rpc(name, {
      p_company_id: scope.companyId,
      p_before_created_at: before?.createdAt ?? null,
      p_before_id: before?.id ?? null,
      p_limit: OPERATIONAL_PAGE_SIZE + 1,
    });
  } catch {
    reportOperationalFailure(dependencies, {
      category: 'rpc',
      operation: 'load',
      module: input.module,
      role: input.role,
    });
    return operationalError(retryHref);
  }
  if (response.error) {
    reportOperationalFailure(dependencies, {
      category: 'rpc',
      operation: 'load',
      module: input.module,
      role: input.role,
    });
    return operationalError(retryHref);
  }
  if (!Array.isArray(response.data)) {
    reportOperationalFailure(dependencies, {
      category: 'schema',
      operation: 'load',
      module: input.module,
      role: input.role,
    });
    return operationalError(retryHref);
  }

  const parsed =
    input.module === 'notifications'
      ? z.array(notificationRow).safeParse(response.data)
      : input.module === 'tasks'
        ? z.array(taskRow).safeParse(response.data)
        : z.array(activityRow).safeParse(response.data);
  if (!parsed.success) {
    reportOperationalFailure(dependencies, {
      category: 'schema',
      operation: 'load',
      module: input.module,
      role: input.role,
    });
    return operationalError(retryHref);
  }

  try {
    const rows = parsed.data.slice(0, OPERATIONAL_PAGE_SIZE);
    const items: OperationalRuntimeItem[] = rows.map((row) => {
      if ('notification_code' in row) {
        return {
          kind: 'notification',
          id: row.id,
          code: row.notification_code,
          severity: row.severity,
          read: row.read_at !== null,
          canSetReadState: row.recipient_profile_id === scope.actorId,
          createdAt: row.created_at,
        };
      }
      if ('task_code' in row) {
        return {
          kind: 'task',
          id: row.id,
          code: row.task_code,
          state: row.state,
          priority: row.priority,
          dueAt: row.due_at,
          createdAt: row.created_at,
        };
      }
      return { kind: 'activity', id: row.id, code: row.activity_code, createdAt: row.created_at };
    });
    const last = items.at(-1);
    return {
      state: items.length === 0 ? 'empty' : 'data',
      channelState: 'disabled',
      items,
      nextHref:
        response.data.length > OPERATIONAL_PAGE_SIZE && last
          ? operationalHref(input.baseHref, scopedCompanyId, last)
          : null,
    };
  } catch {
    reportOperationalFailure(dependencies, {
      category: 'schema',
      operation: 'load',
      module: input.module,
      role: input.role,
    });
    return operationalError(retryHref);
  }
}

export async function setOperationalNotificationReadState(
  input: Pick<LoadOperationalRuntimeInput, 'role' | 'tenantSlug' | 'requestedCompanyId'> & {
    notificationId: string;
    read: boolean;
    operationId?: string;
  },
  dependencies: OperationalDependencies = {},
): Promise<{ ok: true } | { ok: false; code: 'unavailable' }> {
  let notificationId: string;
  let operationId: string;
  try {
    notificationId = uuid.parse(input.notificationId);
    operationId = uuid.parse(input.operationId ?? randomUUID());
  } catch {
    reportOperationalFailure(dependencies, {
      category: 'schema',
      operation: 'mutation',
      module: 'notifications',
      role: input.role,
    });
    return { ok: false, ...sanitizeOperationalError() };
  }
  let scope: OperationalScope | null;
  try {
    scope = await resolveOperationalScope(input, dependencies);
  } catch {
    reportOperationalFailure(dependencies, {
      category: 'authorization',
      operation: 'mutation',
      module: 'notifications',
      role: input.role,
    });
    return { ok: false, ...sanitizeOperationalError() };
  }
  if (!scope) {
    reportOperationalFailure(dependencies, {
      category: 'authorization',
      operation: 'mutation',
      module: 'notifications',
      role: input.role,
    });
    return { ok: false, ...sanitizeOperationalError() };
  }
  try {
    const { error } = await (
      await rpcClient(dependencies)
    ).rpc('set_operational_notification_read_state', {
      p_company_id: scope.companyId,
      p_notification_id: notificationId,
      p_read: input.read,
      p_operation_id: operationId,
    });
    if (error) {
      reportOperationalFailure(dependencies, {
        category: 'rpc',
        operation: 'mutation',
        module: 'notifications',
        role: input.role,
      });
      return { ok: false, ...sanitizeOperationalError() };
    }
    return { ok: true };
  } catch {
    reportOperationalFailure(dependencies, {
      category: 'rpc',
      operation: 'mutation',
      module: 'notifications',
      role: input.role,
    });
    return { ok: false, ...sanitizeOperationalError() };
  }
}
