// Canonical PostgreSQL UUID-text regex. Use it where every PostgreSQL-accepted
// bit pattern is valid; use `z.string().uuid()` where RFC variant checks are required.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
