import type { BlogPost } from '@/lib/data/blog';
import type { PublicReadState } from '@/lib/public-content/read-state';
import {
  emptyState,
  missingState,
  readyState,
  unavailableState,
} from '@/lib/public-content/read-state';

type SearchValue = string | string[] | undefined;

export async function resolveBlogIndex(
  load: () => Promise<BlogPost[]>,
): Promise<PublicReadState<BlogPost[]>> {
  try {
    const posts = await load();
    return posts.length ? readyState(posts) : emptyState();
  } catch {
    return unavailableState();
  }
}

export async function resolveBlogDetail(
  slug: string,
  load: (slug: string) => Promise<BlogPost | null>,
): Promise<PublicReadState<BlogPost>> {
  try {
    const post = await load(slug);
    return post ? readyState(post) : missingState();
  } catch {
    return unavailableState();
  }
}

export function normalizeBlogQuery(value: string): string {
  return normalizeSearchText(value).slice(0, 160);
}

export function filterBlogPosts(posts: readonly BlogPost[], query: string): BlogPost[] {
  const normalized = normalizeBlogQuery(query);
  if (!normalized) return [...posts];
  return posts.filter((post) =>
    normalizeSearchText([post.title, post.excerpt ?? ''].join(' ')).includes(normalized),
  );
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
}

export function parseBlogPage(value: SearchValue, totalPages: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^[1-9]\d*$/u.test(raw)) return 1;
  return Math.min(Number(raw), Math.max(1, totalPages));
}

export function blogPageHref(page: number, query = ''): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (page > 1) params.set('page', String(page));
  const value = params.toString();
  return value ? `/blog?${value}` : '/blog';
}

export function buildBlogArticleJsonLd(post: BlogPost, siteOrigin: string) {
  const value: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
  };
  if (post.excerpt) value.description = post.excerpt;
  if (post.publishedAt) value.datePublished = post.publishedAt;
  value.dateModified = post.updatedAt;
  value.url = `${siteOrigin.replace(/\/+$/u, '')}/blog/${post.slug}`;
  return value;
}
