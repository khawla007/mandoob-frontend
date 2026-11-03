import Image from 'next/image';
import Link from 'next/link';
import { cache } from 'react';

import { PublicContentState } from '@/components/public-content/PublicContentState';
import { getBlogCoverImage } from '@/lib/blog/cover-image';
import { blogPageHref, normalizeBlogQuery, parseBlogPage } from '@/lib/blog/public-presentation';
import {
  listPublishedBlogPostsPage,
  type BlogListPage,
  type PublicBlogCategory,
} from '@/lib/data/blog';

/**
 * Public blog listing shared by `/blog` and `/blog/category/[slug]`: hero,
 * category chips, eight-per-page home-style cards and pagination.
 */
export const BLOG_POSTS_PER_PAGE = 8;
const loadPublishedBlogPostsPage = cache((page: number, q: string, category: string) =>
  listPublishedBlogPostsPage({ page, pageSize: BLOG_POSTS_PER_PAGE, q, category }),
);
type SearchParams = Record<string, string | string[] | undefined>;

export async function BlogListing({
  searchParams,
  categories,
  category,
}: {
  searchParams: SearchParams;
  categories: readonly PublicBlogCategory[];
  category?: PublicBlogCategory;
}) {
  const params = searchParams;
  const query = normalizeBlogQuery(firstValue(params.q));
  const requestedPage = parseBlogPage(params.page, 10_000);
  const categorySlug = category?.slug ?? '';
  let result: BlogListPage | null = null;
  try {
    result = await loadPublishedBlogPostsPage(requestedPage, query, categorySlug);
    const availablePages = Math.max(1, Math.ceil(result.total / BLOG_POSTS_PER_PAGE));
    if (requestedPage > availablePages) {
      result = await loadPublishedBlogPostsPage(availablePages, query, categorySlug);
    }
  } catch {
    result = null;
  }
  const total = result?.total ?? 0;
  const currentPage = result?.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / BLOG_POSTS_PER_PAGE));
  const pagePosts = result?.items ?? [];

  return (
    <>
      <section className="blog-hero" aria-labelledby="blog-h">
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
              {category ? (
                <>
                  <Link href="/blog">Blog</Link>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">{category.name}</span>
                </>
              ) : (
                <span aria-current="page">Blog</span>
              )}
            </nav>
            <span className="eyebrow eyebrow--accent">
              {category ? 'Blog category' : 'Blog & Insights'}
            </span>
            <h1 id="blog-h" className="blog-hero__title">
              {category ? category.name : 'Knowledge Base & Business Insights'}
            </h1>
            <p className="lede">
              {category?.description ?? 'Practical articles to help you start and grow in the UAE.'}
            </p>
            <form
              className="kb-search blog-search"
              action={category ? `/blog/category/${category.slug}` : '/blog'}
              role="search"
            >
              <label htmlFor="blog-query" className="sr-only">
                Search published articles
              </label>
              <div className="kb-search__control">
                <input
                  id="blog-query"
                  name="q"
                  type="search"
                  defaultValue={query}
                  placeholder="Search articles"
                  aria-describedby="blog-search-help blog-search-status"
                />
                <button className="btn btn--accent" type="submit">
                  Search
                </button>
              </div>
              <p id="blog-search-help" className="sr-only">
                Search is applied to all published article titles and summaries.
              </p>
            </form>
          </div>
        </div>
      </section>

      <section className="kb-reference-section blog-index" aria-labelledby="blog-featured-h">
        <div className="container">
          <div className="kb-section-row">
            <header>
              <h2 id="blog-featured-h">
                {category ? `${category.name} Articles` : 'All Articles'}
              </h2>
              {result && total > 0 ? (
                <p>
                  {total} {total === 1 ? 'published article' : 'published articles'}.
                </p>
              ) : null}
            </header>
            {query ? (
              <Link className="btn btn--outline" href={blogPageHref(1, '', categorySlug)}>
                Clear search
              </Link>
            ) : null}
          </div>
          {categories.length > 0 ? (
            <nav id="blog-categories" className="blog-categories" aria-label="Blog categories">
              <Link
                className="blog-categories__chip"
                href="/blog"
                aria-current={category ? undefined : 'page'}
              >
                All
              </Link>
              {categories.map((item) => (
                <Link
                  key={item.slug}
                  className="blog-categories__chip"
                  href={`/blog/category/${item.slug}`}
                  aria-current={category?.slug === item.slug ? 'page' : undefined}
                >
                  {item.name} <span>{item.postCount}</span>
                </Link>
              ))}
            </nav>
          ) : null}
          {result ? (
            <p id="blog-search-status" className="sr-only" aria-live="polite">
              {total} {total === 1 ? 'article' : 'articles'} found.
            </p>
          ) : null}

          {!result ? (
            <PublicContentState
              eyebrow="Temporarily unavailable"
              title="The Blog could not be loaded."
              description="Published articles are temporarily unavailable. No private or draft content was shown."
              recoveryHref={blogPageHref(1, '', categorySlug)}
              recoveryLabel="Try again"
              retry
            />
          ) : null}
          {result && total === 0 && !query ? (
            <PublicContentState
              eyebrow="No published articles"
              title="There are no public Blog articles yet."
              description="This successful read returned no published articles. The Knowledge Base remains available."
              recoveryHref="/knowledge-base"
              recoveryLabel="Browse the Knowledge Base"
            />
          ) : null}
          {result && total === 0 && query ? (
            <PublicContentState
              eyebrow="No matching articles"
              title="No matching articles were found."
              description={`No published article matches “${query}”. Clear the search to browse all public articles.`}
              recoveryHref="/blog"
              recoveryLabel="Clear search"
            />
          ) : null}
          {result && pagePosts.length > 0 ? (
            <>
              <div className="home-knowledge-grid blog-post-grid">
                {pagePosts.map((post, index) => (
                  <BlogPostCell key={post.id} post={post} priority={index < 3} />
                ))}
              </div>
              {totalPages > 1 ? (
                <BlogPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  query={query}
                  category={categorySlug}
                />
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
  category,
}: {
  currentPage: number;
  totalPages: number;
  query: string;
  category: string;
}) {
  return (
    <nav className="blog-pagination" aria-label="Blog pagination">
      {currentPage === 1 ? (
        <span className="blog-pagination__link blog-pagination__link--disabled">
          <span aria-hidden="true">←</span> Previous
        </span>
      ) : (
        <Link
          className="blog-pagination__link"
          href={blogPageHref(currentPage - 1, query, category)}
        >
          <span aria-hidden="true">←</span> Previous
        </Link>
      )}
      <div className="blog-pagination__pages">
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
          <Link
            key={page}
            className="blog-pagination__page"
            href={blogPageHref(page, query, category)}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </Link>
        ))}
      </div>
      {currentPage === totalPages ? (
        <span className="blog-pagination__link blog-pagination__link--disabled">
          Next <span aria-hidden="true">→</span>
        </span>
      ) : (
        <Link
          className="blog-pagination__link"
          href={blogPageHref(currentPage + 1, query, category)}
        >
          Next <span aria-hidden="true">→</span>
        </Link>
      )}
    </nav>
  );
}

function BlogPostCell({
  post,
  priority,
}: {
  post: BlogListPage['items'][number];
  priority: boolean;
}) {
  const cover = getBlogCoverImage(post.title, post.slug);
  return (
    <article className="home-knowledge-card blog-card">
      <Link
        href={`/blog/${post.slug}`}
        className="home-knowledge-card__media blog-card__media"
        tabIndex={-1}
      >
        <Image
          src={cover.src}
          alt={cover.alt}
          fill
          priority={priority}
          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
        />
        <span>{post.categories?.[0]?.name ?? 'Article'}</span>
      </Link>
      <div className="home-knowledge-card__body">
        {post.publishedAt ? (
          <time className="blog-card__date" dateTime={post.publishedAt}>
            {formatDate(post.publishedAt)}
          </time>
        ) : null}
        <h3>
          <Link href={`/blog/${post.slug}`}>{post.title}</Link>
        </h3>
        {post.excerpt ? <p>{post.excerpt}</p> : null}
        <Link className="home-text-link" href={`/blog/${post.slug}`}>
          Read Article <span aria-hidden="true">→</span>
        </Link>
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
