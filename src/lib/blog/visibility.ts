import type { BlogPostStatus } from '@/lib/validation/blog';

export type BlogPostVisibilityInput = {
  status: BlogPostStatus | string;
  publishedAt?: Date | string | null;
  deletedAt?: Date | string | null;
};

export function isBlogPostPublic(input: BlogPostVisibilityInput, now: Date = new Date()): boolean {
  if (input.deletedAt) return false;
  if (input.status !== 'published') return false;
  if (!input.publishedAt) return false;

  const publishedAt =
    input.publishedAt instanceof Date ? input.publishedAt : new Date(input.publishedAt);

  return Number.isFinite(publishedAt.getTime()) && publishedAt.getTime() <= now.getTime();
}
