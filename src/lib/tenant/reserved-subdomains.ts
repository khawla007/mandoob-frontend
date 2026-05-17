export const RESERVED_SUBDOMAINS = new Set<string>([
  'www',
  'app',
  'admin',
  'api',
  'auth',
  'status',
  'assets',
  'mail',
  'ws',
  'cdn',
  'dashboard',
]);

export function isReservedSubdomain(label: string): boolean {
  return RESERVED_SUBDOMAINS.has(label.toLowerCase());
}
