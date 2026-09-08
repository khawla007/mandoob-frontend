const ALLOWED_ROOTS = [
  '/admin',
  '/account',
  '/apply',
  '/company-setup',
  '/estimate',
  '/knowledge-base',
  '/pricing',
  '/pro',
] as const;

const NORMAL_PATH = /^\/(?:[a-z0-9][a-z0-9-]*)(?:\/[a-z0-9][a-z0-9-]*)*$/;
const TENANT_PATH = /^\/t\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/;

/** Returns a canonical local application path, or `/` for untrusted input. */
export function sharedSafeDestination(rawDestination: string | null | undefined): string {
  if (!rawDestination || /[\s\\%\u0000-\u001f\u007f-\u009f]/u.test(rawDestination)) {
    return '/';
  }
  if (rawDestination === '/reset-password') return rawDestination;

  const path = rawDestination.split(/[?#]/u, 1)[0];
  if (path === '/') return path;
  if (!path || path.endsWith('/') || !NORMAL_PATH.test(path)) return '/';

  if (ALLOWED_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))) {
    return path;
  }

  return TENANT_PATH.test(path) ? path : '/';
}
