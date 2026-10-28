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
  | { state: 'error'; code: 'unavailable'; channelState: 'disabled'; items: [] }
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

export function sanitizeOperationalError(_error: unknown): { code: 'unavailable' } {
  void _error;
  return { code: 'unavailable' };
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

function nextHref(
  baseHref: string,
  companyId: string | undefined,
  item: OperationalRuntimeItem,
): string {
  const query = new URLSearchParams();
  if (companyId) query.set('companyId', companyId);
  query.set('before', item.createdAt);
  query.set('beforeId', item.id);
  return `${baseHref}?${query.toString()}`;
}

export async function loadOperationalWorkspace(
  input: LoadOperationalRuntimeInput,
  dependencies: OperationalDependencies = {},
): Promise<OperationalRuntimeModel> {
  try {
    const scope = await resolveOperationalScope(input, dependencies);
    if (!scope) return { state: 'scope-required', channelState: 'disabled', items: [] };
    if (input.module === 'communications') {
      return { state: 'unavailable', channelState: 'disabled', items: [] };
    }

    const search = input.search ?? {};
    const before = cursor(search);
    const name = {
      notifications: 'list_operational_notifications',
      tasks: 'list_operational_tasks',
      activity: 'list_operational_activity',
    }[input.module] as Exclude<RuntimeRpcName, 'set_operational_notification_read_state'>;
    const { data, error } = await (
      await rpcClient(dependencies)
    ).rpc(name, {
      p_company_id: scope.companyId,
      p_before_created_at: before?.createdAt ?? null,
      p_before_id: before?.id ?? null,
      p_limit: OPERATIONAL_PAGE_SIZE + 1,
    });
    if (error || !Array.isArray(data)) throw error ?? new Error('OPERATIONAL_READ_FAILED');

    const parsed =
      input.module === 'notifications'
        ? z.array(notificationRow).safeParse(data)
        : input.module === 'tasks'
          ? z.array(taskRow).safeParse(data)
          : z.array(activityRow).safeParse(data);
    if (!parsed.success) throw new Error('OPERATIONAL_RESPONSE_INVALID');

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
        data.length > OPERATIONAL_PAGE_SIZE && last
          ? nextHref(input.baseHref, input.role === 'admin' ? scope.companyId : undefined, last)
          : null,
    };
  } catch (error) {
    return {
      state: 'error',
      ...sanitizeOperationalError(error),
      channelState: 'disabled',
      items: [],
    };
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
  try {
    const notificationId = uuid.parse(input.notificationId);
    const operationId = uuid.parse(input.operationId ?? randomUUID());
    const scope = await resolveOperationalScope(input, dependencies);
    if (!scope) return { ok: false, code: 'unavailable' };
    const { error } = await (
      await rpcClient(dependencies)
    ).rpc('set_operational_notification_read_state', {
      p_notification_id: notificationId,
      p_read: input.read,
      p_operation_id: operationId,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return { ok: false, ...sanitizeOperationalError(error) };
  }
}
