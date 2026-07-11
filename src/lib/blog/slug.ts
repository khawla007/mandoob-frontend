const BLOG_SLUG_MAX = 120;

export function normalizeBlogSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, BLOG_SLUG_MAX)
    .replace(/-+$/g, '');

  return slug || 'post';
}
