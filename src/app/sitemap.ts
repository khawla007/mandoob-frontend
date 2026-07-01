import type { MetadataRoute } from 'next';
import { listPublishedBlogPosts } from '@/lib/data/blog';
import { seededCostDataRows } from '@/lib/estimator/seed-data';
import { authoritySlugFor, knowledgeBaseArticles } from '@/lib/knowledge-base';

const DEFAULT_ORIGIN = 'https://mandoob.ae';

type SitemapBlogPost = {
  slug: string;
  updatedAt: string;
  noindex?: boolean;
};

type SitemapInput = {
  origin?: string;
  knowledgeBaseArticleSlugs?: string[];
  blogPosts?: SitemapBlogPost[];
};

export function getAuthoritySlugs(rows = seededCostDataRows): string[] {
  return [...new Set(rows.map((row) => authoritySlugFor(row.authority)))].sort();
}

export function buildPublicSitemap({
  origin = DEFAULT_ORIGIN,
  knowledgeBaseArticleSlugs = knowledgeBaseArticles.map((article) => article.slug),
  blogPosts = [],
}: SitemapInput = {}): MetadataRoute.Sitemap {
  const base = origin.replace(/\/+$/, '');
  const staticPaths = ['/', '/estimate', '/apply', '/pricing', '/knowledge-base', '/blog'];
  const articlePaths = knowledgeBaseArticleSlugs.map((slug) => `/knowledge-base/${slug}`);
  const authorityPaths = getAuthoritySlugs().map((slug) => `/company-setup/${slug}`);
  const staticEntries = [...staticPaths, ...articlePaths, ...authorityPaths].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date('2026-05-08'),
    changeFrequency: path === '/' ? ('weekly' as const) : ('monthly' as const),
    priority: path === '/' ? 1 : path === '/estimate' ? 0.9 : 0.7,
  }));

  const blogEntries = blogPosts
    .filter((post) => !post.noindex)
    .map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));

  return [...staticEntries, ...blogEntries];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let blogPosts: SitemapBlogPost[] = [];
  try {
    blogPosts = await listPublishedBlogPosts();
  } catch (error) {
    console.error('Could not load blog posts for sitemap', error);
  }
  return buildPublicSitemap({ blogPosts });
}
