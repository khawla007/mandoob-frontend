import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { PublicContentState } from '@/components/public-content/PublicContentState';
import { getBlogCoverImage } from '@/lib/blog/cover-image';
import { buildBlogArticleJsonLd, resolveBlogDetail } from '@/lib/blog/public-presentation';
import { sanitizeBlogHtml } from '@/lib/blog/render';
import { getPublishedBlogPostBySlug } from '@/lib/data/blog';
import { withDevelopmentItemEvidence } from '@/lib/public-content/development-evidence';
import { serializeJsonLd } from '@/lib/public-content/json-ld';
import { buildUnavailableMetadata } from '@/lib/public-metadata';

type Params = { slug: string };
const SITE_ORIGIN = 'https://mandoob.ae';
const getCachedPost = cache(
  withDevelopmentItemEvidence(getPublishedBlogPostBySlug, {
    nodeEnv: process.env.NODE_ENV,
    mode: process.env.P107_BLOG_DETAIL_EVIDENCE_STATE,
  }),
);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const state = await resolveBlogDetail(slug, getCachedPost);
  if (state.status !== 'ready') {
    return buildUnavailableMetadata({
      title: 'Blog article unavailable',
      description: 'This published Blog article is not available.',
      canonical: `/blog/${slug}`,
    });
  }
  const post = state.data;
  const description = post.metaDescription ?? post.excerpt ?? undefined;
  const canonical = post.canonicalUrl ?? `/blog/${post.slug}`;
  const cover = getBlogCoverImage(post.title, post.slug);
  return {
    title: post.metaTitle ?? `${post.title} | Mandoob Blog`,
    description,
    alternates: { canonical },
    robots: post.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: post.metaTitle ?? post.title,
      description,
      type: 'article',
      url: canonical,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      images: [{ url: cover.src, alt: cover.alt }],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const state = await resolveBlogDetail(slug, getCachedPost);
  if (state.status === 'missing') notFound();
  if (state.status === 'unavailable') {
    return (
      <PublicContentState
        eyebrow="Temporarily unavailable"
        title="This Blog article could not be loaded."
        description="The public source is temporarily unavailable. No draft content or internal error details were shown."
        recoveryHref={`/blog/${encodeURIComponent(slug)}`}
        recoveryLabel="Try again"
        retry
        headingLevel="h1"
      />
    );
  }
  if (state.status !== 'ready') notFound();

  const post = state.data;
  const html = sanitizeBlogHtml(post.contentHtml);
  const cover = getBlogCoverImage(post.title, post.slug);
  const jsonLd = buildBlogArticleJsonLd(post, SITE_ORIGIN);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <section className="kb-editorial-hero blog-editorial-hero" aria-labelledby="blog-article-h">
        <div className="container">
          <nav className="kb-editorial-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/blog">Blog</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{post.title}</span>
          </nav>
          <div className="kb-article__meta">
            <span className="eyebrow">Blog</span>
            {post.publishedAt ? (
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            ) : null}
          </div>
          <h1 id="blog-article-h" className="display">
            {post.title}
          </h1>
          {post.excerpt ? <p className="lede">{post.excerpt}</p> : null}
          <div className="blog-article__cover">
            <Image src={cover.src} alt={cover.alt} fill sizes="100vw" priority />
          </div>
        </div>
      </section>
      <section className="section" aria-label="Article body">
        <div className="container">
          <div className="kb-article">
            <div className="kb-article__main">
              <article className="cell">
                <div className="kb-prose" dangerouslySetInnerHTML={{ __html: html }} />
              </article>
            </div>
            <aside className="kb-article__aside" aria-label="Article resources" role="region">
              <div className="cell">
                <span className="eyebrow">Planning tool</span>
                <h2>Estimate your setup</h2>
                <p>
                  Use an indicative estimate, then confirm current authority fees, timing,
                  approvals, and requirements.
                </p>
                <Link className="btn btn--accent" href="/estimate">
                  Open estimator
                </Link>
              </div>
              <div className="cell">
                <span className="eyebrow">More guidance</span>
                <h2>Browse the Blog</h2>
                <p>Return to all currently published public articles.</p>
                <Link className="btn btn--outline" href="/blog">
                  All articles
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value),
  );
}
