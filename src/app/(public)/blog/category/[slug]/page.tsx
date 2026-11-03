import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { BlogListing } from '@/components/site/blog/BlogListing';
import { listPublicBlogCategories } from '@/lib/data/blog';
import { buildPublicMetadata } from '@/lib/public-metadata';

type SearchParams = Record<string, string | string[] | undefined>;
type Params = Promise<{ slug: string }>;
const loadCategories = cache(() => listPublicBlogCategories().catch(() => []));

async function findCategory(slug: string) {
  const categories = await loadCategories();
  return { categories, category: categories.find((item) => item.slug === slug) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { category } = await findCategory(slug);
  if (!category) return { title: 'Blog category not found' };
  return buildPublicMetadata({
    title: `${category.name} | UAE Business Blog`,
    description:
      category.description ?? `Published ${category.name} articles for UAE company setup.`,
    canonical: `/blog/category/${category.slug}`,
  });
}

export default async function BlogCategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { categories, category } = await findCategory(slug);
  if (!category) notFound();
  return <BlogListing searchParams={query} categories={categories} category={category} />;
}
