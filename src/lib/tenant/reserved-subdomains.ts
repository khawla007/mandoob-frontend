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
]);

export function isReservedSubdomain(label: string): boolean {
  return RESERVED_SUBDOMAINS.has(label.toLowerCase());
}
