import type { PageStatus } from '@/lib/validation/pages';

export type CmsPageVisibilityInput = {
  status: PageStatus | string;
  publishedAt?: Date | string | null;
  deletedAt?: Date | string | null;
};

export function isCmsPagePublic(input: CmsPageVisibilityInput, now: Date = new Date()): boolean {
  if (input.deletedAt || input.status !== 'published' || !input.publishedAt) return false;
  const publishedAt = input.publishedAt instanceof Date ? input.publishedAt : new Date(input.publishedAt);
  return Number.isFinite(publishedAt.getTime()) && publishedAt.getTime() <= now.getTime();
}
