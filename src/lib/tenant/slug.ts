import { isReservedSubdomain } from './reserved-subdomains';

const SLUG_MAX = 40;

export function baseTenantSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');

  return cleaned.length >= 3 ? cleaned : 'tenant';
}

export function suggestTenantSlug(nameOrSlug: string, taken: Set<string>): string {
  const base = baseTenantSlug(nameOrSlug);
  if (!taken.has(base) && !isReservedSubdomain(base)) return base;

  const suffixBase = base.slice(0, SLUG_MAX - 3).replace(/-+$/g, '') || 'tenant';
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${suffixBase}-${i}`;
    if (!taken.has(candidate) && !isReservedSubdomain(candidate)) return candidate;
  }

  throw new Error('Could not suggest an available tenant slug');
}
