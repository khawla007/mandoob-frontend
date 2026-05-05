import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { groupFailedLoginsByIp, type FailedLoginRow } from '@/lib/data/security-helpers';

export type SecurityKpis = {
  failedLogins24h: number;
  lockedAccounts: number;
  lockedNetblocks: number;
};

export type LockedAccountRow = {
  key: string;
  count: number;
  lockedUntil: string;
  updatedAt: string;
};

export type TopFailedIp = { ip: string; count: number };

export type RecentMfaFailure = {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  ip: string | null;
  details: unknown;
};

export type SecurityDashboardData = {
  kpis: SecurityKpis;
  lockedAccounts: LockedAccountRow[];
  topFailedIps24h: TopFailedIp[];
  recentMfaFailures: RecentMfaFailure[];
};

function isoHoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

export async function loadSecurityDashboard(): Promise<SecurityDashboardData> {
  const admin = createSupabaseServiceRoleClient();
  const since24h = isoHoursAgo(24);
  const nowIso = new Date().toISOString();

  const [failedLoginsCount, lockedAcctCount, lockedNetCount, lockedRows, failedIpRows, mfaRows] =
    await Promise.all([
      admin
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .in('kind', ['login_failure', 'mfa_challenge_failure'])
        .gte('occurred_at', since24h),
      admin
        .from('auth_failed_attempts')
        .select('key', { count: 'exact', head: true })
        .like('key', 'acct:%')
        .gt('locked_until', nowIso),
      admin
        .from('auth_failed_attempts')
        .select('key', { count: 'exact', head: true })
        .like('key', 'net:%')
        .gt('locked_until', nowIso),
      admin
        .from('auth_failed_attempts')
        .select('key, count, locked_until, updated_at')
        .like('key', 'acct:%')
        .gt('locked_until', nowIso)
        .order('locked_until', { ascending: false })
        .limit(50),
      admin
        .from('auth_events')
        .select('ip')
        .eq('kind', 'login_failure')
        .gte('occurred_at', since24h)
        .limit(2000),
      admin
        .from('auth_events')
        .select('id, occurred_at, actor_user_id, ip, details')
        .eq('kind', 'mfa_challenge_failure')
        .order('occurred_at', { ascending: false })
        .limit(50),
    ]);

  const top = groupFailedLoginsByIp(
    (failedIpRows.data ?? []) as ReadonlyArray<FailedLoginRow>,
  ).slice(0, 10);

  return {
    kpis: {
      failedLogins24h: failedLoginsCount.count ?? 0,
      lockedAccounts: lockedAcctCount.count ?? 0,
      lockedNetblocks: lockedNetCount.count ?? 0,
    },
    lockedAccounts: (
      (lockedRows.data ?? []) as ReadonlyArray<{
        key: string;
        count: number;
        locked_until: string;
        updated_at: string;
      }>
    ).map((r) => ({
      key: r.key,
      count: r.count,
      lockedUntil: r.locked_until,
      updatedAt: r.updated_at,
    })),
    topFailedIps24h: top,
    recentMfaFailures: (
      (mfaRows.data ?? []) as ReadonlyArray<{
        id: number | string;
        occurred_at: string;
        actor_user_id: string | null;
        ip: string | null;
        details: unknown;
      }>
    ).map((r) => ({
      id: String(r.id),
      occurredAt: r.occurred_at,
      actorUserId: r.actor_user_id,
      ip: r.ip,
      details: r.details ?? null,
    })),
  };
}
