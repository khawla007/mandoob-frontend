import { normalizeBlogSlug } from '@/lib/blog/slug';

export const RESERVED_PAGE_SLUGS = new Set([
  '_next', 'about', 'account', 'admin', 'api', 'apply', 'blog', 'company-setup', 'contact',
  'estimate', 'forgot-password', 'invite', 'knowledge-base', 'legal', 'login', 'mfa', 'pricing',
  'pro', 'register', 'reset-password', 'signin', 't', 'verify-otp',
]);

export function normalizePageSlug(value: string): string {
  return normalizeBlogSlug(value);
}

export function assertPageSlugAvailable(value: string): string {
  const routeSegment = value.trim().toLowerCase();
  const slug = normalizePageSlug(value);
  if (RESERVED_PAGE_SLUGS.has(routeSegment) || RESERVED_PAGE_SLUGS.has(slug)) {
    throw new Error(`Page slug "${routeSegment}" is reserved`);
  }
  return slug;
}
