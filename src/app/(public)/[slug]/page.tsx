import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { PublicCmsPage, buildCmsPageMetadata } from '@/components/pages/PublicCmsPage';
import { PublicContentState } from '@/components/public-content/PublicContentState';
import { getPublishedCmsPageBySlug } from '@/lib/data/pages';
import { isLegalCmsPageSlug } from '@/lib/pages/legal';
import { resolveGenericPageState } from '@/lib/pages/public-presentation';
import { DEVELOPMENT_CMS_EVIDENCE_PAGE } from '@/lib/public-content/development-cms-fixture';
import { withDevelopmentItemEvidence } from '@/lib/public-content/development-evidence';
import { serializeJsonLd } from '@/lib/public-content/json-ld';
import { buildUnavailableMetadata } from '@/lib/public-metadata';

type PageProps = { params: Promise<{ slug: string }> };
const getCachedPublishedPage = cache(
  withDevelopmentItemEvidence(getPublishedCmsPageBySlug, {
    nodeEnv: process.env.NODE_ENV,
    mode: process.env.P107_CMS_EVIDENCE_STATE,
    fixture: DEVELOPMENT_CMS_EVIDENCE_PAGE,
  }),
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (isLegalCmsPageSlug(slug)) return {};
  const state = await resolveGenericPageState(slug, getCachedPublishedPage);
  return state.status === 'ready'
    ? buildCmsPageMetadata(state.data)
    : buildUnavailableMetadata({
        title: 'Page unavailable',
        description: 'This published public page is not available.',
        canonical: `/${slug}`,
      });
}

export default async function CmsPageRoute({ params }: PageProps) {
  const { slug } = await params;
  if (isLegalCmsPageSlug(slug)) notFound();
  const state = await resolveGenericPageState(slug, getCachedPublishedPage);
  if (state.status === 'missing') notFound();
  if (state.status === 'unavailable') {
    return (
      <PublicContentState
        eyebrow="Page unavailable"
        title="This public page could not be loaded."
        description="The published content source is temporarily unavailable. No draft content or internal error detail is being shown."
        recoveryHref={`/${encodeURIComponent(slug)}`}
        recoveryLabel="Try again"
        retry
        headingLevel="h1"
      />
    );
  }
  if (state.status !== 'ready') notFound();
  return (
    <>
      <PublicCmsPage page={state.data} />
      {state.data.schemaMarkup ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(state.data.schemaMarkup) }}
        />
      ) : null}
    </>
  );
}
