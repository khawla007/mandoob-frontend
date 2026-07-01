import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublishedBlogPosts, type BlogPost } from '@/lib/data/blog';

export const metadata: Metadata = {
  title: 'UAE Business Blog | Mandoob',
  description:
    'Editorial updates and practical guidance for UAE company setup, licensing, renewals, compliance, and PRO operations.',
  alternates: {
    canonical: '/blog',
  },
};

export default async function BlogPage() {
  let posts: BlogPost[] = [];
  try {
    posts = await listPublishedBlogPosts();
  } catch (error) {
    console.warn('Could not load public blog posts', error);
  }
  const featured = posts.slice(0, 3);
  const remainingPosts = posts.slice(3);

  return (
    <>
      <section className="blog-hero" aria-labelledby="blog-h">
        <div className="container blog-hero__inner">
          <div className="blog-hero__copy">
            <span className="eyebrow">Blog</span>
            <h1 id="blog-h" className="display">
              Field notes for UAE business operators.
            </h1>
            <p className="lede">
              Practical commentary on setup decisions, licensing work, renewals, compliance, and the
              operating details that shape company formation in the UAE.
            </p>
          </div>
        </div>
      </section>

      <section className="blog-hero-summary" aria-label="Blog summary">
        <div className="container">
          <div className="blog-hero-summary__rail">
            <div>
              <span className="mono blog-hero__metric">{posts.length}</span>
              <span className="blog-hero__metricL">articles</span>
            </div>
            <div>
              <span className="mono blog-hero__metric">Public</span>
              <span className="blog-hero__metricL">guidance</span>
            </div>
            <div>
              <span className="mono blog-hero__metric blog-hero__metric--accent">UAE</span>
              <span className="blog-hero__metricL">company setup</span>
            </div>
            <div>
              <span className="mono blog-hero__metric">Updated</span>
              <span className="blog-hero__metricL">by editors</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="blog-featured-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">01 · Latest</span>
            <h2 id="blog-featured-h" className="h2">
              Recent articles.
            </h2>
          </header>
        </div>
        <div className="container">
          {posts.length > 0 ? (
            <>
              <div className="cell-row">
                {featured.map((post) => (
                  <BlogPostCell key={post.id} post={post} />
                ))}
              </div>

              {remainingPosts.length > 0 ? (
                <div className="kb-grid kb-grid--3">
                  {remainingPosts.map((post) => (
                    <BlogPostCell key={post.id} post={post} />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <article className="cell">
              <span className="eyebrow">No articles yet</span>
              <h3>Published guidance will appear here.</h3>
              <p>
                The blog is ready for public posts once the editorial team publishes the first
                article.
              </p>
            </article>
          )}
        </div>
      </section>
    </>
  );
}

function BlogPostCell({ post }: { post: BlogPost }) {
  return (
    <article className="cell cell--svc">
      <div className="kb-meta">
        <span className="eyebrow">Article</span>
        {post.publishedAt ? (
          <span className="cell__sub mono">{formatDate(post.publishedAt)}</span>
        ) : null}
      </div>
      <h3>
        <Link href={`/blog/${post.slug}`} className="kb-card__title">
          {post.title}
        </Link>
      </h3>
      {post.excerpt ? <p>{post.excerpt}</p> : null}
      <p className="cell__sub mono kb-card__updated">Read article</p>
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
