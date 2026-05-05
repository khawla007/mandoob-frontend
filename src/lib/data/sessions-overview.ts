import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { resolveProfilesByIds, type ResolvedProfile } from '@/lib/data/profile-lookups';

export type SessionsWindow = '24h' | '7d' | '30d' | 'all';

export type SessionOverviewRow = {
  sessionId: string;
  userId: string;
  fullName: string | null;
  role: string | null;
  tenantId: string | null;
  tenantName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  refreshedAt: string | null;
  notAfter: string | null;
};

export type SessionsFiltersInput = {
  tenant?: string;
  role?: string;
  window?: SessionsWindow;
};

const WINDOW_HOURS: Record<SessionsWindow, number | null> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  all: null,
};

const PAGE_LIMIT = 200;

export async function listActiveSessions(
  filters: SessionsFiltersInput,
): Promise<SessionOverviewRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const window = filters.window ?? '7d';
  const hours = WINDOW_HOURS[window];

  let q = admin
    .from('admin_active_sessions')
    .select('id, user_id, created_at, refreshed_at, not_after, user_agent, ip')
    .order('refreshed_at', { ascending: false, nullsFirst: false })
    .limit(PAGE_LIMIT);

  if (hours != null) {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    q = q.gte('created_at', since);
  }

  const { data, error } = await q;
  if (error) {
    console.error('listActiveSessions failed', error);
    return [];
  }

  const rawRows = (data ?? []) as ReadonlyArray<{
    id: string;
    user_id: string;
    created_at: string;
    refreshed_at: string | null;
    not_after: string | null;
    user_agent: string | null;
    ip: string | null;
  }>;

  const userIds = rawRows.map((r) => r.user_id);
  const profiles = await resolveProfilesByIds(userIds);

  let rows: SessionOverviewRow[] = rawRows.map((r) => {
    const p: ResolvedProfile | undefined = profiles.get(r.user_id);
    return {
      sessionId: r.id,
      userId: r.user_id,
      fullName: p?.fullName ?? null,
      role: p?.role ?? null,
      tenantId: p?.tenantId ?? null,
      tenantName: p?.tenantName ?? null,
      ip: r.ip,
      userAgent: r.user_agent,
      createdAt: r.created_at,
      refreshedAt: r.refreshed_at,
      notAfter: r.not_after,
    };
  });

  if (filters.tenant) rows = rows.filter((r) => r.tenantId === filters.tenant);
  if (filters.role) rows = rows.filter((r) => r.role === filters.role);

  return rows;
}
