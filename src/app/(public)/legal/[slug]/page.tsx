import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { PublicCmsPage, buildCmsPageMetadata } from '@/components/pages/PublicCmsPage';
import { PublicContentState } from '@/components/public-content/PublicContentState';
import { getPublishedCmsPageBySlug } from '@/lib/data/pages';
import { resolveLegalPageState } from '@/lib/pages/public-presentation';
import { withDevelopmentItemEvidence } from '@/lib/public-content/development-evidence';
import { serializeJsonLd } from '@/lib/public-content/json-ld';
import { buildUnavailableMetadata } from '@/lib/public-metadata';

type PageProps = { params: Promise<{ slug: string }> };
const getCachedPublishedPage = cache(
  withDevelopmentItemEvidence(getPublishedCmsPageBySlug, {
    nodeEnv: process.env.NODE_ENV,
    mode: process.env.P107_LEGAL_EVIDENCE_STATE,
  }),
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const state = await resolveLegalPageState(slug, getCachedPublishedPage);
  return state.status === 'ready'
    ? buildCmsPageMetadata(state.data)
    : buildUnavailableMetadata({
        title: 'Legal page unavailable',
        description: 'This published legal page is not available.',
        canonical: `/legal/${slug}`,
      });
}

export default async function LegalCmsPageRoute({ params }: PageProps) {
  const { slug } = await params;
  const state = await resolveLegalPageState(slug, getCachedPublishedPage);
  if (state.status === 'missing') notFound();
  if (state.status === 'unavailable') {
    return (
      <PublicContentState
        eyebrow="Legal content unavailable"
        title="This legal page could not be loaded."
        description="The approved public content source is temporarily unavailable. No substitute legal text or internal error detail is being shown."
        recoveryHref={`/legal/${encodeURIComponent(slug)}`}
        recoveryLabel="Try again"
        retry
        headingLevel="h1"
      />
    );
  }
  if (state.status !== 'ready') notFound();
  return (
    <>
      <PublicCmsPage page={state.data} kind="legal" />
      {state.data.schemaMarkup ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(state.data.schemaMarkup) }}
        />
      ) : null}
    </>
  );
}
