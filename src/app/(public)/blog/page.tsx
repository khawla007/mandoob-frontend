import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cache } from 'react';

import { PublicContentState } from '@/components/public-content/PublicContentState';
import { getBlogCoverImage } from '@/lib/blog/cover-image';
import {
  blogPageHref,
  filterBlogPosts,
  normalizeBlogQuery,
  parseBlogPage,
  resolveBlogIndex,
} from '@/lib/blog/public-presentation';
import { listPublishedBlogPosts, type BlogPost } from '@/lib/data/blog';
import { withDevelopmentCollectionEvidence } from '@/lib/public-content/development-evidence';
import { buildPublicMetadata, buildUnavailableMetadata } from '@/lib/public-metadata';

const BLOG_POSTS_PER_PAGE = 12;
const loadPublishedBlogPosts = cache(
  withDevelopmentCollectionEvidence(listPublishedBlogPosts, {
    nodeEnv: process.env.NODE_ENV,
    mode: process.env.P107_BLOG_INDEX_EVIDENCE_STATE,
  }),
);
type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const state = await resolveBlogIndex(loadPublishedBlogPosts);
  const input = {
    title: 'UAE Business Blog',
    description:
      'Published guidance for UAE Company setup, licensing, renewals, compliance, and PRO operations.',
    canonical: '/blog',
  };
  return state.status === 'unavailable'
    ? buildUnavailableMetadata({ ...input, title: 'Blog unavailable' })
    : buildPublicMetadata(input);
}

export default async function BlogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = normalizeBlogQuery(firstValue(params.q));
  const state = await resolveBlogIndex(loadPublishedBlogPosts);

  let filteredPosts: BlogPost[] = [];
  let currentPage = 1;
  let totalPages = 1;
  let pagePosts: BlogPost[] = [];
  if (state.status === 'ready') {
    filteredPosts = filterBlogPosts(state.data, query);
    totalPages = Math.max(1, Math.ceil(filteredPosts.length / BLOG_POSTS_PER_PAGE));
    currentPage = parseBlogPage(params.page, totalPages);
    pagePosts = filteredPosts.slice(
      (currentPage - 1) * BLOG_POSTS_PER_PAGE,
      currentPage * BLOG_POSTS_PER_PAGE,
    );
  }

  return (
    <>
      <section className="blog-hero" aria-labelledby="blog-h">
        <div className="blog-hero__inner container">
          <div className="blog-hero__copy">
            <nav className="kb-editorial-breadcrumb" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Blog</span>
            </nav>
            <span className="eyebrow">Blog</span>
            <h1 id="blog-h" className="display">
              Published guidance for UAE business decisions.
            </h1>
            <p className="lede">
              Read public articles on setup choices, licensing, renewals, compliance, and the
              operating details that shape a UAE Company.
            </p>
            <form className="kb-search blog-search" action="/blog" role="search">
              <label htmlFor="blog-query">Search published articles</label>
              <div className="kb-search__control">
                <input
                  id="blog-query"
                  name="q"
                  type="search"
                  defaultValue={query}
                  placeholder="Search titles and summaries"
                  aria-describedby="blog-search-help blog-search-status"
                />
                <button className="btn btn--accent" type="submit">
                  Search
                </button>
              </div>
              <p id="blog-search-help" className="micro">
                Search uses only the currently loaded public article titles and summaries.
              </p>
            </form>
          </div>
        </div>
      </section>

      <section className="kb-reference-section blog-index" aria-labelledby="blog-featured-h">
        <div className="container">
          <div className="kb-section-row">
            <header>
              <span className="eyebrow">Published articles</span>
              <h2 id="blog-featured-h">Latest guidance</h2>
            </header>
            {query ? (
              <Link className="kb-text-link" href="/blog">
                Clear search
              </Link>
            ) : null}
          </div>
          {state.status === 'ready' ? (
            <p id="blog-search-status" className="sr-only" aria-live="polite">
              {filteredPosts.length} {filteredPosts.length === 1 ? 'article' : 'articles'} found.
            </p>
          ) : null}

          {state.status === 'unavailable' ? (
            <PublicContentState
              eyebrow="Temporarily unavailable"
              title="The Blog could not be loaded."
              description="Published articles are temporarily unavailable. No private or draft content was shown."
              recoveryHref="/blog"
              recoveryLabel="Try again"
              retry
            />
          ) : null}
          {state.status === 'empty' ? (
            <PublicContentState
              eyebrow="No published articles"
              title="There are no public Blog articles yet."
              description="This successful read returned no published articles. The Knowledge Base remains available."
              recoveryHref="/knowledge-base"
              recoveryLabel="Browse the Knowledge Base"
            />
          ) : null}
          {state.status === 'ready' && filteredPosts.length === 0 ? (
            <PublicContentState
              eyebrow="No matching articles"
              title="No matching articles were found."
              description={`No published article matches “${query}”. Clear the search to browse all public articles.`}
              recoveryHref="/blog"
              recoveryLabel="Clear search"
            />
          ) : null}
          {state.status === 'ready' && pagePosts.length > 0 ? (
            <>
              <FeaturedPost post={pagePosts[0]!} />
              {pagePosts.length > 1 ? (
                <div className="kb-guide-grid blog-post-grid">
                  {pagePosts.slice(1).map((post) => (
                    <BlogPostCell key={post.id} post={post} />
                  ))}
                </div>
              ) : null}
              {totalPages > 1 ? (
                <BlogPagination currentPage={currentPage} totalPages={totalPages} query={query} />
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}

function BlogPagination({
  currentPage,
  totalPages,
  query,
}: {
  currentPage: number;
  totalPages: number;
  query: string;
}) {
  return (
    <nav className="blog-pagination" aria-label="Blog pagination">
      {currentPage === 1 ? (
        <span className="blog-pagination__link blog-pagination__link--disabled">Previous</span>
      ) : (
        <Link className="blog-pagination__link" href={blogPageHref(currentPage - 1, query)}>
          Previous
        </Link>
      )}
      <div className="blog-pagination__pages">
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
          <Link
            key={page}
            className="blog-pagination__page"
            href={blogPageHref(page, query)}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </Link>
        ))}
      </div>
      {currentPage === totalPages ? (
        <span className="blog-pagination__link blog-pagination__link--disabled">Next</span>
      ) : (
        <Link className="blog-pagination__link" href={blogPageHref(currentPage + 1, query)}>
          Next
        </Link>
      )}
    </nav>
  );
}

function FeaturedPost({ post }: { post: BlogPost }) {
  const cover = getBlogCoverImage(post.title, post.slug);
  return (
    <article className="blog-featured-card">
      <Link href={`/blog/${post.slug}`} className="blog-featured-card__media">
        <Image
          src={cover.src}
          alt={cover.alt}
          fill
          sizes="(max-width: 1023px) 100vw, 50vw"
          priority
        />
      </Link>
      <div>
        <span className="eyebrow">Latest published</span>
        {post.publishedAt ? (
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        ) : null}
        <h3>
          <Link href={`/blog/${post.slug}`}>{post.title}</Link>
        </h3>
        {post.excerpt ? <p>{post.excerpt}</p> : null}
        <Link className="kb-text-link" href={`/blog/${post.slug}`}>
          Read article
        </Link>
      </div>
    </article>
  );
}

function BlogPostCell({ post }: { post: BlogPost }) {
  const cover = getBlogCoverImage(post.title, post.slug);
  return (
    <article className="kb-guide-card">
      <Link
        href={`/blog/${post.slug}`}
        className="kb-guide-card__media blog-card__media"
        tabIndex={-1}
      >
        <Image
          src={cover.src}
          alt={cover.alt}
          fill
          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
        />
      </Link>
      <div className="kb-guide-card__body">
        <span className="eyebrow">Article</span>
        {post.publishedAt ? (
          <time className="micro" dateTime={post.publishedAt}>
            {formatDate(post.publishedAt)}
          </time>
        ) : null}
        <h3>
          <Link href={`/blog/${post.slug}`}>{post.title}</Link>
        </h3>
        {post.excerpt ? <p>{post.excerpt}</p> : null}
        <span className="micro">Read article</span>
      </div>
    </article>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value),
  );
}
