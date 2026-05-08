import type { MetadataRoute } from 'next';
import { seededCostDataRows } from '@/lib/estimator/seed-data';
import { authoritySlugFor, knowledgeBaseArticles } from '@/lib/knowledge-base';

const DEFAULT_ORIGIN = 'https://mandoob.ae';

type SitemapInput = {
  origin?: string;
  knowledgeBaseArticleSlugs?: string[];
};

export function getAuthoritySlugs(rows = seededCostDataRows): string[] {
  return [...new Set(rows.map((row) => authoritySlugFor(row.authority)))].sort();
}

export function buildPublicSitemap({
  origin = DEFAULT_ORIGIN,
  knowledgeBaseArticleSlugs = knowledgeBaseArticles.map((article) => article.slug),
}: SitemapInput = {}): MetadataRoute.Sitemap {
  const base = origin.replace(/\/+$/, '');
  const staticPaths = ['/', '/estimate', '/pricing', '/knowledge-base'];
  const articlePaths = knowledgeBaseArticleSlugs.map((slug) => `/knowledge-base/${slug}`);
  const authorityPaths = getAuthoritySlugs().map((slug) => `/company-setup/${slug}`);

  return [...staticPaths, ...articlePaths, ...authorityPaths].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date('2026-05-08'),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/estimate' ? 0.9 : 0.7,
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildPublicSitemap();
}
