import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Dual-key lockout: count failures per account AND per /24 IP netblock.
 * Prevents both brute-force-from-one-IP and distributed-botnet credential stuffing.
 */

const ACCOUNT_MAX = 5;
const ACCOUNT_WINDOW_MIN = 15;
const NETBLOCK_MAX = 50;
const NETBLOCK_WINDOW_MIN = 15;

export type LockoutCheck = { locked: boolean; reason?: 'account' | 'netblock' };

function netblock24(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  const v6 = ip.split(':');
  return v6.slice(0, 4).join(':') + '::/64';
}

function windowStart(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

async function getRow(key: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from('auth_failed_attempts')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  return data as {
    key: string;
    count: number;
    locked_until: string | null;
    updated_at: string;
  } | null;
}

async function upsertRow(key: string, count: number, lockedUntil: Date | null) {
  const admin = createSupabaseServiceRoleClient();
  await admin.from('auth_failed_attempts').upsert(
    {
      key,
      count,
      locked_until: lockedUntil?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
}

export async function checkLockout(emailOrUserId: string, ip: string): Promise<LockoutCheck> {
  const acct = await getRow(`acct:${emailOrUserId.toLowerCase()}`);
  const net = await getRow(`net:${netblock24(ip)}`);
  const now = Date.now();
  if (acct?.locked_until && new Date(acct.locked_until).getTime() > now) {
    return { locked: true, reason: 'account' };
  }
  if (net?.locked_until && new Date(net.locked_until).getTime() > now) {
    return { locked: true, reason: 'netblock' };
  }
  return { locked: false };
}

export async function recordFailure(emailOrUserId: string, ip: string): Promise<LockoutCheck> {
  const windowAcct = windowStart(ACCOUNT_WINDOW_MIN);
  const windowNet = windowStart(NETBLOCK_WINDOW_MIN);

  const acctKey = `acct:${emailOrUserId.toLowerCase()}`;
  const netKey = `net:${netblock24(ip)}`;

  const acct = await getRow(acctKey);
  const net = await getRow(netKey);

  const acctCount = acct && new Date(acct.updated_at) > windowAcct ? acct.count + 1 : 1;
  const netCount = net && new Date(net.updated_at) > windowNet ? net.count + 1 : 1;

  const acctLockedUntil =
    acctCount >= ACCOUNT_MAX ? new Date(Date.now() + ACCOUNT_WINDOW_MIN * 60_000) : null;
  const netLockedUntil =
    netCount >= NETBLOCK_MAX ? new Date(Date.now() + NETBLOCK_WINDOW_MIN * 60_000) : null;

  await upsertRow(acctKey, acctCount, acctLockedUntil);
  await upsertRow(netKey, netCount, netLockedUntil);

  if (acctLockedUntil) return { locked: true, reason: 'account' };
  if (netLockedUntil) return { locked: true, reason: 'netblock' };
  return { locked: false };
}

export async function clearFailures(emailOrUserId: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  await admin
    .from('auth_failed_attempts')
    .delete()
    .eq('key', `acct:${emailOrUserId.toLowerCase()}`);
}
