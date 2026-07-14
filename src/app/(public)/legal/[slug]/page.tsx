import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import {
  buildCmsPageMetadata,
  PublicCmsPage,
  serializeSchema,
} from '@/components/pages/PublicCmsPage';
import { getPublishedCmsPageBySlug } from '@/lib/data/pages';
import { resolveLegalCmsPage } from '@/lib/pages/legal';

type PageProps = { params: Promise<{ slug: string }> };

const getCachedPublishedPage = cache(getPublishedCmsPageBySlug);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildCmsPageMetadata(await resolveLegalCmsPage(slug, getCachedPublishedPage));
}

export default async function LegalCmsPageRoute({ params }: PageProps) {
  const { slug } = await params;
  const page = await resolveLegalCmsPage(slug, getCachedPublishedPage);
  if (!page) notFound();

  return (
    <>
      <PublicCmsPage page={page} />
      {page.schemaMarkup ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeSchema(page.schemaMarkup) }}
        />
      ) : null}
    </>
  );
}
