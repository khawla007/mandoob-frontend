import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  buildArticleJsonLd,
  buildFaqJsonLd,
  getArticleBySlug,
  getRelatedArticles,
  knowledgeBaseArticles,
  SITE_ORIGIN,
  type KnowledgeBaseArticle,
} from '@/lib/knowledge-base';

type Params = { slug: string };

type ArticleSection = {
  heading: string;
  body: string | string[];
};

export function generateStaticParams() {
  return knowledgeBaseArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    return {};
  }

  return {
    title: `${article.title} | Mandoob Knowledge Base`,
    description: article.description,
    keywords: article.keywords,
    alternates: {
      canonical: `/knowledge-base/${article.slug}`,
    },
    openGraph: {
      title: article.title,
      description: article.description,
      type: 'article',
      url: `/knowledge-base/${article.slug}`,
    },
  };
}

export default async function KnowledgeBaseArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) notFound();

  const relatedArticles = getRelatedArticles(article);
  const articleJsonLd = buildArticleJsonLd(article, SITE_ORIGIN);
  const faqJsonLd = article.faq.length ? buildFaqJsonLd(article.faq) : null;
  const estimateHref = buildEstimateHref(article);
  const readingTime = `${article.readingTimeMinutes} min read`;

  return (
    <article>
      <JsonLd data={articleJsonLd} />
      {faqJsonLd ? <JsonLd data={faqJsonLd} /> : null}

      <section className="section" aria-labelledby="kb-article-h">
        <div className="container">
          <div className="kb-article__meta">
            <span className="eyebrow">{article.category}</span>
            <span className="mono">{readingTime}</span>
            <span className="mono">Updated {article.updatedAt}</span>
          </div>
          <h1 id="kb-article-h" className="display">
            {article.title}
          </h1>
          <p className="lede">{article.description}</p>
        </div>
      </section>

      <section className="section" aria-label="Article body">
        <div className="container">
          <div className="kb-article">
            <div className="kb-article__main">
              {article.sections.map((section) => (
                <article key={section.heading} className="cell">
                  <h2>{section.heading}</h2>
                  <SectionBody section={section} />
                </article>
              ))}

              {article.faq.length ? (
                <article className="cell">
                  <h2>Frequently asked questions</h2>
                  <div className="kb-faq__list">
                    {article.faq.map((item) => (
                      <div key={item.question} className="kb-faq__item">
                        <h3>{item.question}</h3>
                        <p>{item.answer}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ) : null}
            </div>

            <aside className="kb-article__aside">
              <div className="cell">
                <span className="eyebrow">Estimate</span>
                <h3>Estimate your setup</h3>
                <p>Turn this guidance into an indicative UAE company setup estimate.</p>
                <Link className="btn btn--accent" href={estimateHref}>
                  {article.cta.label ?? 'Open estimator'}
                </Link>
              </div>

              {relatedArticles.length > 0 ? (
                <div className="cell">
                  <span className="eyebrow">Related</span>
                  <h3>Related guides</h3>
                  <div className="kb-related">
                    {relatedArticles.map((related) => (
                      <Link
                        key={related.slug}
                        href={`/knowledge-base/${related.slug}`}
                        className="kb-related__item"
                      >
                        <strong>{related.title}</strong>
                        <span>{related.description}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>
    </article>
  );
}

function SectionBody({ section }: { section: ArticleSection }) {
  const paragraphs = Array.isArray(section.body) ? section.body : section.body ? [section.body] : [];

  return (
    <div className="kb-prose">
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

function buildEstimateHref(article: KnowledgeBaseArticle) {
  const context = article.cta;
  const params = new URLSearchParams();
  if (context?.jurisdiction) params.set('jurisdiction', context.jurisdiction);
  if (context?.authority) params.set('authority', context.authority);
  if (context?.emirate) params.set('emirate', context.emirate);
  const query = params.toString();
  return query ? `/estimate?${query}` : '/estimate';
}
