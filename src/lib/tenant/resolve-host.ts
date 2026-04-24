import { isReservedSubdomain } from './reserved-subdomains';

export type HostContext =
  | { kind: 'marketing' }
  | { kind: 'admin' }
  | { kind: 'tenant'; slug: string };

export type ResolveHostInput = {
  host: string;
  rootDomain: string;
};

/**
 * Decide whether a request targets the marketing site, the admin console, or a
 * tenant subdomain. Handles apex, `www`, reserved labels, and local dev on
 * `*.localhost:3000`.
 */
export function resolveHost({ host, rootDomain }: ResolveHostInput): HostContext {
  const normalized = host.toLowerCase();
  const root = rootDomain.toLowerCase();

  if (normalized === root) return { kind: 'marketing' };

  if (!normalized.endsWith(`.${root}`)) {
    // Unknown host (preview deploy, ALB direct-hit, etc.) → treat as marketing.
    return { kind: 'marketing' };
  }

  const subdomainPart = normalized.slice(0, normalized.length - root.length - 1);
  const firstLabel = subdomainPart.split('.')[0] ?? '';

  if (firstLabel === 'www') return { kind: 'marketing' };
  if (firstLabel === 'admin') return { kind: 'admin' };
  if (isReservedSubdomain(firstLabel)) return { kind: 'marketing' };

  return { kind: 'tenant', slug: firstLabel };
}

export function isAuthPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/verify-otp' ||
    pathname.startsWith('/mfa/') ||
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/auth/')
  );
}

// Paths that must never be rewritten under a tenant or admin subdomain.
// API + auth routes live at the root on every host.
export function isPassthroughPath(pathname: string): boolean {
  return isAuthPath(pathname) || pathname.startsWith('/api/');
}
