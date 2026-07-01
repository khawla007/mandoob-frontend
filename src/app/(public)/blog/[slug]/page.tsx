import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sanitizeBlogHtml } from '@/lib/blog/render';
import { getPublishedBlogPostBySlug } from '@/lib/data/blog';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);

  if (!post) {
    return {};
  }

  const description = post.metaDescription ?? post.excerpt ?? undefined;
  const canonical = post.canonicalUrl ?? `/blog/${post.slug}`;

  return {
    title: post.metaTitle ?? `${post.title} | Mandoob Blog`,
    description,
    alternates: {
      canonical,
    },
    robots: post.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: post.metaTitle ?? post.title,
      description,
      type: 'article',
      url: canonical,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);

  if (!post) notFound();

  const html = sanitizeBlogHtml(post.contentHtml);

  return (
    <article>
      <section className="section" aria-labelledby="blog-article-h">
        <div className="container">
          <div className="kb-article__meta">
            <span className="eyebrow">Blog</span>
            {post.publishedAt ? <span className="mono">{formatDate(post.publishedAt)}</span> : null}
          </div>
          <h1 id="blog-article-h" className="display">
            {post.title}
          </h1>
          {post.excerpt ? <p className="lede">{post.excerpt}</p> : null}
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

            <aside className="kb-article__aside">
              <div className="cell">
                <span className="eyebrow">Mandoob</span>
                <h3>Estimate your setup</h3>
                <p>Turn this guidance into an indicative UAE company setup estimate.</p>
                <Link className="btn btn--accent" href="/estimate">
                  Open estimator
                </Link>
              </div>
              <div className="cell">
                <span className="eyebrow">More guidance</span>
                <h3>Browse the blog</h3>
                <p>Read the latest Mandoob notes on UAE setup, licensing, and compliance.</p>
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
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
