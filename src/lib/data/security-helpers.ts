export type FailedLoginRow = { ip: string | null };

export function groupFailedLoginsByIp(
  rows: ReadonlyArray<FailedLoginRow>,
): Array<{ ip: string; count: number }> {
  const acc = new Map<string, number>();
  for (const r of rows) {
    if (!r.ip) continue;
    acc.set(r.ip, (acc.get(r.ip) ?? 0) + 1);
  }
  return Array.from(acc.entries())
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count);
}

export type ParsedLockoutKey =
  | { kind: 'acct'; value: string }
  | { kind: 'net'; value: string }
  | null;

export function parseLockoutKey(key: string | null | undefined): ParsedLockoutKey {
  if (!key) return null;
  const lower = key.toLowerCase();
  if (lower.startsWith('acct:')) return { kind: 'acct', value: key.slice(5) };
  if (lower.startsWith('net:')) return { kind: 'net', value: key.slice(4) };
  return null;
}
