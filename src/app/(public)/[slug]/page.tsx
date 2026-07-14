import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { buildCmsPageMetadata, PublicCmsPage, resolvePublicCmsPage, serializeSchema } from '@/components/pages/PublicCmsPage';
import { getPublishedCmsPageBySlug } from '@/lib/data/pages';
import { isLegalCmsPageSlug } from '@/lib/pages/legal';

type Params = { slug: string };
type PageProps = { params: Promise<Params> };
const getCachedPublishedPage = cache(getPublishedCmsPageBySlug);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (isLegalCmsPageSlug(slug)) return {};
  return buildCmsPageMetadata(await resolvePublicCmsPage(slug, getCachedPublishedPage));
}

export default async function CmsPageRoute({ params }: PageProps) {
  const { slug } = await params;
  if (isLegalCmsPageSlug(slug)) notFound();
  const page = await resolvePublicCmsPage(slug, getCachedPublishedPage);
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
