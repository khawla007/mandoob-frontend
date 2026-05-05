import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { resolveProfilesByIds, type ResolvedProfile } from '@/lib/data/profile-lookups';
import { encodeCursor, decodeCursor } from '@/lib/data/audit-log-cursor';
import {
  TENANT_AUDIT_ACTIONS,
  AUTH_EVENT_KINDS,
  type AuditKind,
  type TenantAuditAction,
  type AuthEventKind,
} from '@/lib/validation/observability';

export { encodeCursor, decodeCursor };
export type { Cursor } from '@/lib/data/audit-log-cursor';

export const PAGE_SIZE = 50;

export type AuditLogRow = {
  kind: AuditKind;
  id: string;
  createdAt: string;
  tenantId: string | null;
  tenantName: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  source: string | null;
  ip: string | null;
  userAgent: string | null;
  details: unknown;
};

export type AuditLogFiltersInput = {
  kind: AuditKind;
  tenant?: string;
  actor?: string;
  actions?: ReadonlyArray<string>;
  from?: string;
  to?: string;
  q?: string;
  cursor?: string;
};

export type AuditLogPage = {
  rows: AuditLogRow[];
  nextCursor: string | null;
};

function isoFromDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toISOString();
}
function isoToEndOfDay(d: string): string {
  return new Date(`${d}T23:59:59.999Z`).toISOString();
}

function escapeLike(s: string): string {
  return s.replace(/[%_]/g, (m) => `\\${m}`);
}

export async function listAuditLog(input: AuditLogFiltersInput): Promise<AuditLogPage> {
  if (input.kind === 'tenant_audit') return listTenantAuditLog(input);
  return listAuthEvents(input);
}

async function listTenantAuditLog(input: AuditLogFiltersInput): Promise<AuditLogPage> {
  const admin = createSupabaseServiceRoleClient();
  const cursor = decodeCursor(input.cursor);

  let q = admin
    .from('tenant_audit_log')
    .select('id, tenant_id, actor_id, action, source, details, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (input.tenant) q = q.eq('tenant_id', input.tenant);
  if (input.actor) q = q.eq('actor_id', input.actor);
  const validActions = (input.actions ?? []).filter((a) =>
    (TENANT_AUDIT_ACTIONS as ReadonlyArray<string>).includes(a as TenantAuditAction),
  );
  if (validActions.length) q = q.in('action', validActions);
  if (input.from) q = q.gte('created_at', isoFromDate(input.from));
  if (input.to) q = q.lte('created_at', isoToEndOfDay(input.to));
  if (input.q && input.q.trim()) {
    q = q.ilike('details::text', `%${escapeLike(input.q.trim())}%`);
  }
  if (cursor) {
    q = q.or(`created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('listTenantAuditLog failed', error);
    return { rows: [], nextCursor: null };
  }

  const slice = (data ?? []).slice(0, PAGE_SIZE);
  const hasMore = (data ?? []).length > PAGE_SIZE;

  const actorIds = slice.map((r) => r.actor_id as string | null).filter((x): x is string => !!x);
  const tenantIds = slice.map((r) => r.tenant_id as string | null).filter((x): x is string => !!x);
  const profiles = await resolveProfilesByIds(actorIds);
  const tenantNames = await fetchTenantNames(tenantIds);

  const rows: AuditLogRow[] = slice.map((r) => {
    const actor = (r.actor_id as string | null) ?? null;
    const p: ResolvedProfile | undefined = actor ? profiles.get(actor) : undefined;
    return {
      kind: 'tenant_audit',
      id: String(r.id),
      createdAt: r.created_at as string,
      tenantId: (r.tenant_id as string | null) ?? null,
      tenantName: r.tenant_id ? (tenantNames.get(r.tenant_id as string) ?? null) : null,
      actorId: actor,
      actorName: p?.fullName ?? null,
      actorRole: p?.role ?? null,
      action: r.action as string,
      source: (r.source as string | null) ?? null,
      ip: null,
      userAgent: null,
      details: r.details ?? null,
    };
  });

  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ ts: last.createdAt, id: last.id }) : null;

  return { rows, nextCursor };
}

async function listAuthEvents(input: AuditLogFiltersInput): Promise<AuditLogPage> {
  const admin = createSupabaseServiceRoleClient();
  const cursor = decodeCursor(input.cursor);

  let q = admin
    .from('auth_events')
    .select('id, tenant_id, actor_user_id, kind, ip, user_agent, details, occurred_at')
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (input.tenant) q = q.eq('tenant_id', input.tenant);
  if (input.actor) q = q.eq('actor_user_id', input.actor);
  const validKinds = (input.actions ?? []).filter((a) =>
    (AUTH_EVENT_KINDS as ReadonlyArray<string>).includes(a as AuthEventKind),
  );
  if (validKinds.length) q = q.in('kind', validKinds);
  if (input.from) q = q.gte('occurred_at', isoFromDate(input.from));
  if (input.to) q = q.lte('occurred_at', isoToEndOfDay(input.to));
  if (input.q && input.q.trim()) {
    q = q.ilike('details::text', `%${escapeLike(input.q.trim())}%`);
  }
  if (cursor) {
    q = q.or(`occurred_at.lt.${cursor.ts},and(occurred_at.eq.${cursor.ts},id.lt.${cursor.id})`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('listAuthEvents failed', error);
    return { rows: [], nextCursor: null };
  }

  const slice = (data ?? []).slice(0, PAGE_SIZE);
  const hasMore = (data ?? []).length > PAGE_SIZE;

  const actorIds = slice
    .map((r) => r.actor_user_id as string | null)
    .filter((x): x is string => !!x);
  const tenantIds = slice.map((r) => r.tenant_id as string | null).filter((x): x is string => !!x);
  const profiles = await resolveProfilesByIds(actorIds);
  const tenantNames = await fetchTenantNames(tenantIds);

  const rows: AuditLogRow[] = slice.map((r) => {
    const actor = (r.actor_user_id as string | null) ?? null;
    const p: ResolvedProfile | undefined = actor ? profiles.get(actor) : undefined;
    return {
      kind: 'auth_event',
      id: String(r.id),
      createdAt: r.occurred_at as string,
      tenantId: (r.tenant_id as string | null) ?? null,
      tenantName: r.tenant_id ? (tenantNames.get(r.tenant_id as string) ?? null) : null,
      actorId: actor,
      actorName: p?.fullName ?? null,
      actorRole: p?.role ?? null,
      action: r.kind as string,
      source: null,
      ip: (r.ip as string | null) ?? null,
      userAgent: (r.user_agent as string | null) ?? null,
      details: r.details ?? null,
    };
  });

  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ ts: last.createdAt, id: last.id }) : null;

  return { rows, nextCursor };
}

async function fetchTenantNames(ids: ReadonlyArray<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return out;
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.from('tenants').select('id, name').in('id', unique);
  if (error) {
    console.error('fetchTenantNames failed', error);
    return out;
  }
  for (const r of data ?? []) out.set(r.id as string, r.name as string);
  return out;
}
