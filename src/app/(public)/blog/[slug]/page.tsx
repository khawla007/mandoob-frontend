import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Clock3 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { PublicContentState } from '@/components/public-content/PublicContentState';
import { ArticleHelpful } from '@/components/site/blog/ArticleHelpful';
import { getBlogCoverImage } from '@/lib/blog/cover-image';
import { buildBlogArticleJsonLd, resolveBlogDetail } from '@/lib/blog/public-presentation';
import { sanitizeBlogHtml } from '@/lib/blog/render';
import { getPublishedBlogPostBySlug, listPublishedBlogPostsPage } from '@/lib/data/blog';
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
  // getPublishedBlogPostBySlug also returns the post's public categories.
  const category = (post as typeof post & { categories?: { slug: string; name: string }[] })
    .categories?.[0];
  const readMinutes = Math.max(1, Math.round(wordCount(post.contentHtml) / 200));
  const related = await loadRelated(post.slug, category?.slug);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <section className="blog-hero blog-article-hero" aria-labelledby="blog-article-h">
        <div className="blog-hero__media" aria-hidden="true">
          <Image
            src="/hero/skyline.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 60vw, 100vw"
          />
        </div>
        <div className="blog-hero__inner container">
          <div className="blog-hero__copy">
            <nav className="kb-editorial-breadcrumb" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden="true">/</span>
              <Link href="/blog">Blog</Link>
              {category ? (
                <>
                  <span aria-hidden="true">/</span>
                  <Link href={`/blog/category/${category.slug}`}>{category.name}</Link>
                </>
              ) : null}
            </nav>
            <span className="eyebrow eyebrow--accent">{category?.name ?? 'Blog'}</span>
            <h1 id="blog-article-h" className="blog-hero__title">
              {post.title}
            </h1>
            {post.excerpt ? <p className="lede">{post.excerpt}</p> : null}
          </div>
        </div>
      </section>
      <section className="blog-article-section" aria-label="Article body">
        <div className="blog-article-layout container">
          <div className="blog-article-card">
            <div className="blog-article__cover">
              <Image
                src={cover.src}
                alt={cover.alt}
                fill
                sizes="(min-width: 1024px) 66vw, 100vw"
                priority
              />
            </div>
            <div className="blog-article__meta">
              {category ? (
                <Link className="blog-article__badge" href={`/blog/category/${category.slug}`}>
                  {category.name}
                </Link>
              ) : null}
              <span className="blog-article__pill">
                <Clock3 aria-hidden="true" /> {readMinutes} min read
              </span>
              {post.publishedAt ? (
                <time className="blog-article__pill" dateTime={post.publishedAt}>
                  {formatDate(post.publishedAt)}
                </time>
              ) : null}
            </div>
            <div
              className="kb-prose blog-article__body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <ArticleHelpful />
          </div>
          <aside className="blog-article-aside" aria-label="Article resources" role="region">
            <div className="blog-article-aside__card">
              <h2>Related Articles</h2>
              {related.length > 0 ? (
                <ul role="list">
                  {related.map((item) => (
                    <li key={item.slug}>
                      <Link href={`/blog/${item.slug}`}>{item.title}</Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link className="btn btn--accent blog-article-aside__cta" href="/estimate">
                Get an Estimate
              </Link>
              <Link className="btn btn--outline blog-article-aside__cta" href="/blog">
                All articles
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </article>
  );
}

/** Up to five other published posts, preferring the same category. */
async function loadRelated(slug: string, categorySlug?: string) {
  try {
    const same = categorySlug
      ? (await listPublishedBlogPostsPage({ page: 1, pageSize: 6, category: categorySlug })).items
      : [];
    const latest = (await listPublishedBlogPostsPage({ page: 1, pageSize: 8 })).items;
    const seen = new Set([slug]);
    return [...same, ...latest]
      .filter((item) => !seen.has(item.slug) && seen.add(item.slug))
      .slice(0, 5);
  } catch {
    return [];
  }
}

function wordCount(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/u)
    .filter(Boolean).length;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value),
  );
}
