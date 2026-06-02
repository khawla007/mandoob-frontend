import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Role } from '@/lib/data/users';

export type Kpi = {
  label: string;
  value: string;
  delta: number;
  deltaLabel: string;
};

/**
 * Admin dashboard KPI carrying stable i18n keys (under admin.stats.*) instead
 * of pre-rendered labels. Resolved to text at the render boundary so the admin
 * dashboard is locale-aware without coupling the data layer to next-intl.
 */
export type AdminKpi = {
  labelKey: string;
  value: string;
  delta: number;
  deltaLabelKey: string;
};

export type SignupPoint = { date: string; signups: number };

export type RecentLoginRow = {
  id: string;
  email: string;
  role: Role | null;
  ip: string;
  location: string;
  time: string;
  status: 'success' | 'failed';
};

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

async function countAuthUsers(): Promise<number> {
  // Count via profiles (1 row per auth user) to avoid paginating listUsers.
  const admin = createSupabaseServiceRoleClient();
  const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true });
  return count ?? 0;
}

export async function getAdminKpis(): Promise<AdminKpi[]> {
  const admin = createSupabaseServiceRoleClient();
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 864e5).toISOString();
  const d14 = new Date(now.getTime() - 14 * 864e5).toISOString();
  const d24h = new Date(now.getTime() - 864e5).toISOString();
  const d48h = new Date(now.getTime() - 2 * 864e5).toISOString();

  const [totalUsers, tenants, logins7d, loginsPrev7d, failed24h, failedPrev24h] = await Promise.all(
    [
      countAuthUsers(),
      admin.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      admin
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'login_success')
        .gte('occurred_at', d7),
      admin
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'login_success')
        .gte('occurred_at', d14)
        .lt('occurred_at', d7),
      admin
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'login_failure')
        .gte('occurred_at', d24h),
      admin
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'login_failure')
        .gte('occurred_at', d48h)
        .lt('occurred_at', d24h),
    ],
  );

  const tenantCount = tenants.count ?? 0;
  const logins = logins7d.count ?? 0;
  const loginsPrev = loginsPrev7d.count ?? 0;
  const failed = failed24h.count ?? 0;
  const failedPrev = failedPrev24h.count ?? 0;

  return [
    {
      labelKey: 'totalUsers',
      value: fmtNumber(totalUsers),
      delta: 0,
      deltaLabelKey: 'allTime',
    },
    {
      labelKey: 'activeTenants',
      value: fmtNumber(tenantCount),
      delta: 0,
      deltaLabelKey: 'statusActive',
    },
    {
      labelKey: 'logins7d',
      value: fmtNumber(logins),
      delta: pctDelta(logins, loginsPrev),
      deltaLabelKey: 'vsPrior7d',
    },
    {
      labelKey: 'failedLogins24h',
      value: fmtNumber(failed),
      delta: pctDelta(failed, failedPrev),
      deltaLabelKey: 'vsPrior24h',
    },
  ];
}

export async function getSignupSeries(days = 30): Promise<SignupPoint[]> {
  const admin = createSupabaseServiceRoleClient();
  const since = new Date(Date.now() - (days - 1) * 864e5);
  since.setUTCHours(0, 0, 0, 0);

  const { data } = await admin
    .from('profiles')
    .select('created_at')
    .gte('created_at', since.toISOString());

  const byDay = new Map<string, number>();
  (data ?? []).forEach((r) => {
    const key = (r.created_at as string).slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  });

  const out: SignupPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 864e5);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, signups: byDay.get(key) ?? 0 });
  }
  return out;
}

export async function getRecentLogins(limit = 10): Promise<RecentLoginRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data: events } = await admin
    .from('auth_events')
    .select('id, kind, actor_user_id, tenant_id, occurred_at, ip, details')
    .in('kind', ['login_success', 'login_failure'])
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (!events || events.length === 0) return [];

  const userIds = Array.from(
    new Set(events.map((e) => e.actor_user_id).filter((v): v is string => !!v)),
  );

  const emailByUserId = new Map<string, string>();
  if (userIds.length) {
    // listUsers filtered to ids — service role, limit bounded by `limit`.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    list?.users.forEach((u) => emailByUserId.set(u.id, u.email ?? ''));
  }

  const { data: profiles } = userIds.length
    ? await admin.from('profiles').select('id, role').in('id', userIds)
    : { data: [] as { id: string; role: Role }[] };
  const roleByUserId = new Map(profiles?.map((p) => [p.id, p.role as Role]) ?? []);

  return events.map((e) => {
    const id = String(e.id);
    const userId = e.actor_user_id as string | null;
    const email = (userId && emailByUserId.get(userId)) || '—';
    return {
      id,
      email,
      role: userId ? (roleByUserId.get(userId) ?? null) : null,
      ip: (e.ip as string | null) ?? '—',
      location: '—',
      time: new Date(e.occurred_at as string).toLocaleString('en-GB', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      status: e.kind === 'login_success' ? 'success' : 'failed',
    };
  });
}
