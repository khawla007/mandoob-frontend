import type { MetadataRoute } from 'next';
import { listPublishedBlogPosts } from '@/lib/data/blog';
import { listPublishedCmsPages } from '@/lib/data/pages';
import { seededCostDataRows } from '@/lib/estimator/seed-data';
import { authoritySlugFor, knowledgeBaseArticles } from '@/lib/knowledge-base';
import { assertPageSlugAvailable, normalizePageSlug } from '@/lib/pages/slug';

const DEFAULT_ORIGIN = 'https://mandoob.ae';

type SitemapBlogPost = {
  slug: string;
  updatedAt: string;
  noindex?: boolean;
};

type SitemapCmsPage = {
  slug: string;
  updatedAt: string;
  noindex: boolean;
};

type SitemapInput = {
  origin?: string;
  knowledgeBaseArticleSlugs?: string[];
  blogPosts?: SitemapBlogPost[];
  cmsPages?: SitemapCmsPage[];
};

export function getAuthoritySlugs(rows = seededCostDataRows): string[] {
  return [...new Set(rows.map((row) => authoritySlugFor(row.authority)))].sort();
}

function canonicalCmsSlug(slug: string): string | null {
  try {
    const normalized = normalizePageSlug(slug);
    return normalized === slug ? assertPageSlugAvailable(slug) : null;
  } catch {
    return null;
  }
}

export function buildPublicSitemap({
  origin = DEFAULT_ORIGIN,
  knowledgeBaseArticleSlugs = knowledgeBaseArticles.map((article) => article.slug),
  blogPosts = [],
  cmsPages = [],
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

  const cmsEntriesByUrl = new Map<string, MetadataRoute.Sitemap[number]>();
  cmsPages
    .filter((page) => !page.noindex)
    .forEach((page) => {
      const slug = canonicalCmsSlug(page.slug);
      if (!slug) return;
      const entry = {
        url: `${base}/${slug}`,
        lastModified: new Date(page.updatedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      };
      const current = cmsEntriesByUrl.get(entry.url);
      if (!current || entry.lastModified.getTime() > current.lastModified!.getTime()) {
        cmsEntriesByUrl.set(entry.url, entry);
      }
    });
  const cmsEntries = [...cmsEntriesByUrl.values()];

  const seenUrls = new Set<string>();
  return [...staticEntries, ...blogEntries, ...cmsEntries].filter((entry) => {
    if (seenUrls.has(entry.url)) return false;
    seenUrls.add(entry.url);
    return true;
  });
}

type SitemapLoaders = {
  listBlogPosts?: () => Promise<SitemapBlogPost[]>;
  listCmsPages?: () => Promise<SitemapCmsPage[]>;
  warn?: (...args: unknown[]) => void;
};

export async function loadSitemapContent({
  listBlogPosts = listPublishedBlogPosts,
  listCmsPages = listPublishedCmsPages,
  warn = console.warn,
}: SitemapLoaders = {}): Promise<{ blogPosts: SitemapBlogPost[]; cmsPages: SitemapCmsPage[] }> {
  let blogPosts: SitemapBlogPost[] = [];
  try {
    blogPosts = await listBlogPosts();
  } catch {
    warn('Could not load blog posts for sitemap');
  }

  let cmsPages: SitemapCmsPage[] = [];
  try {
    cmsPages = await listCmsPages();
  } catch {
    warn('Could not load CMS pages for sitemap');
  }

  return { blogPosts, cmsPages };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildPublicSitemap(await loadSitemapContent());
}
