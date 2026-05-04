import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Kpi, SignupPoint, RecentLoginRow } from '@/lib/data/admin-metrics';
import type { Role } from '@/lib/data/users';

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

export async function getTenantKpis(tenantId: string): Promise<Kpi[]> {
  const admin = createSupabaseServiceRoleClient();
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 864e5).toISOString();
  const d14 = new Date(now.getTime() - 14 * 864e5).toISOString();
  const d24h = new Date(now.getTime() - 864e5).toISOString();
  const d48h = new Date(now.getTime() - 2 * 864e5).toISOString();

  const [members, pendingInvites, logins7d, loginsPrev7d, failed24h, failedPrev24h] =
    await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      admin
        .from('invites')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('accepted_at', null)
        .gte('expires_at', now.toISOString()),
      admin
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('kind', 'login_success')
        .gte('occurred_at', d7),
      admin
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('kind', 'login_success')
        .gte('occurred_at', d14)
        .lt('occurred_at', d7),
      admin
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('kind', 'login_failure')
        .gte('occurred_at', d24h),
      admin
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('kind', 'login_failure')
        .gte('occurred_at', d48h)
        .lt('occurred_at', d24h),
    ]);

  const logins = logins7d.count ?? 0;
  const loginsPrev = loginsPrev7d.count ?? 0;
  const failed = failed24h.count ?? 0;
  const failedPrev = failedPrev24h.count ?? 0;

  return [
    {
      label: 'Team members',
      value: fmt(members.count ?? 0),
      delta: 0,
      deltaLabel: 'in tenant',
    },
    {
      label: 'Pending invites',
      value: fmt(pendingInvites.count ?? 0),
      delta: 0,
      deltaLabel: 'not yet accepted',
    },
    {
      label: 'Logins (7d)',
      value: fmt(logins),
      delta: pctDelta(logins, loginsPrev),
      deltaLabel: 'vs prior 7d',
    },
    {
      label: 'Failed logins (24h)',
      value: fmt(failed),
      delta: pctDelta(failed, failedPrev),
      deltaLabel: 'vs prior 24h',
    },
  ];
}

export async function getTenantSignupSeries(tenantId: string, days = 30): Promise<SignupPoint[]> {
  const admin = createSupabaseServiceRoleClient();
  const since = new Date(Date.now() - (days - 1) * 864e5);
  since.setUTCHours(0, 0, 0, 0);

  const { data } = await admin
    .from('profiles')
    .select('created_at')
    .eq('tenant_id', tenantId)
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

export async function getTenantRecentLogins(
  tenantId: string,
  limit = 10,
): Promise<RecentLoginRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data: events } = await admin
    .from('auth_events')
    .select('id, kind, actor_user_id, occurred_at, ip')
    .eq('tenant_id', tenantId)
    .in('kind', ['login_success', 'login_failure'])
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (!events || events.length === 0) return [];

  const userIds = Array.from(
    new Set(events.map((e) => e.actor_user_id).filter((v): v is string => !!v)),
  );

  const emailByUserId = new Map<string, string>();
  if (userIds.length) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    list?.users.forEach((u) => emailByUserId.set(u.id, u.email ?? ''));
  }

  const { data: profiles } = userIds.length
    ? await admin.from('profiles').select('id, role').in('id', userIds)
    : { data: [] as { id: string; role: Role }[] };
  const roleByUserId = new Map(profiles?.map((p) => [p.id, p.role as Role]) ?? []);

  return events.map((e) => ({
    id: String(e.id),
    email: (e.actor_user_id && emailByUserId.get(e.actor_user_id as string)) || '—',
    role: e.actor_user_id ? (roleByUserId.get(e.actor_user_id as string) ?? null) : null,
    ip: (e.ip as string | null) ?? '—',
    location: '—',
    time: new Date(e.occurred_at as string).toLocaleString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    status: e.kind === 'login_success' ? 'success' : 'failed',
  }));
}

export type TenantMember = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: Role | null;
  status: 'active' | 'invited' | 'disabled' | 'suspended' | null;
  lastSignInAt: string | null;
  createdAt: string | null;
};

export async function listTenantMembers(tenantId: string): Promise<TenantMember[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, role, status, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id as string);
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const userById = new Map(list?.users.map((u) => [u.id, u]) ?? []);

  return profiles
    .filter((p) => ids.includes(p.id as string))
    .map((p) => {
      const u = userById.get(p.id as string);
      return {
        id: p.id as string,
        email: u?.email ?? null,
        fullName: (p.full_name as string | null) ?? null,
        role: (p.role as Role | null) ?? null,
        status: (p.status as TenantMember['status']) ?? null,
        lastSignInAt: u?.last_sign_in_at ?? null,
        createdAt: (p.created_at as string | null) ?? null,
      };
    });
}

// PRO workspace dashboard KPIs. Real client count is queried from the `clients`
// table; renewal/document/payment counters are placeholders until Steps 11+
// (renewals, document mgmt, payments) wire real data.
export async function getProDashboardMetrics(tenantId: string): Promise<Kpi[]> {
  const admin = createSupabaseServiceRoleClient();
  const { count: activeClients } = await admin
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const active = activeClients ?? 0;

  return [
    { label: 'Active clients', value: fmt(active), delta: 0, deltaLabel: 'live' },
    { label: 'Renewals due (30d)', value: '—', delta: 0, deltaLabel: 'wired in step 11' },
    { label: 'Docs awaiting review', value: '—', delta: 0, deltaLabel: 'wired in step 11' },
    { label: 'Pending payments', value: '—', delta: 0, deltaLabel: 'wired in step 11' },
  ];
}
