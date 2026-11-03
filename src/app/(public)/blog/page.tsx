import type { Metadata } from 'next';
import { cache } from 'react';

import { BlogListing } from '@/components/site/blog/BlogListing';
import { listPublicBlogCategories, listPublishedBlogPostsPage } from '@/lib/data/blog';
import { buildPublicMetadata, buildUnavailableMetadata } from '@/lib/public-metadata';

type SearchParams = Record<string, string | string[] | undefined>;
const loadCategories = cache(() => listPublicBlogCategories().catch(() => []));

export async function generateMetadata(): Promise<Metadata> {
  let available = true;
  try {
    await listPublishedBlogPostsPage({ page: 1, pageSize: 1 });
  } catch {
    available = false;
  }
  const input = {
    title: 'UAE Business Blog',
    description:
      'Published guidance for UAE Company setup, licensing, renewals, compliance, and PRO operations.',
    canonical: '/blog',
  };
  return !available
    ? buildUnavailableMetadata({ ...input, title: 'Blog unavailable' })
    : buildPublicMetadata(input);
}

export default async function BlogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, categories] = await Promise.all([searchParams, loadCategories()]);
  return <BlogListing searchParams={params} categories={categories} />;
}
