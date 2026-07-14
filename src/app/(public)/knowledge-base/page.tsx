import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getArticlesByCategory,
  knowledgeBaseArticles,
  type KnowledgeBaseArticle,
} from '@/lib/knowledge-base';

export const metadata: Metadata = {
  title: 'UAE Company Setup Knowledge Base | Mandoob',
  description:
    'Browse practical UAE company setup guides covering free zones, mainland licensing, documents, timelines, visas, costs, and compliance.',
  alternates: {
    canonical: '/knowledge-base',
  },
};

export default function KnowledgeBasePage() {
  const articles = knowledgeBaseArticles;
  const groupedArticles = getArticlesByCategory();
  const featured = articles.slice(0, 3);
  const faqHighlights = articles.flatMap((article) => article.faq).slice(0, 4);

  return (
    <>
      {/* ============ HERO ============ */}
      <section className="hero hero--knowledge-base" aria-labelledby="kb-h">
        <div className="hero__overlay" aria-hidden="true" />
        <div className="container">
          <span className="eyebrow">Knowledge Base</span>
          <h1 id="kb-h" className="display">
            UAE company setup, <span className="u-accent">decoded.</span>
          </h1>
          <p className="lede">
            Compare setup paths, required documents, timelines, cost assumptions, and compliance
            steps before moving into an indicative estimate.
          </p>
          <div className="cta-row">
            <Link className="btn btn--accent" href="/estimate">
              Estimate setup cost
            </Link>
            <a className="btn btn--outline" href="#topics">
              Browse topics
            </a>
          </div>
        </div>
        <div className="hero__rule" aria-hidden="true" />
        <div className="container">
          <div className="hero__metrics">
            <div>
              <span className="mono hero__metric">{articles.length}</span>
              <span className="hero__metricL">guides</span>
            </div>
            <div>
              <span className="mono hero__metric">{groupedArticles.length}</span>
              <span className="hero__metricL">topics</span>
            </div>
            <div>
              <span className="mono hero__metric u-accent">45+</span>
              <span className="hero__metricL">free zones</span>
            </div>
            <div>
              <span className="mono hero__metric">Monthly</span>
              <span className="hero__metricL">updates</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FEATURED ============ */}
      <section className="section" aria-labelledby="kb-featured-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">01 · Featured</span>
            <h2 id="kb-featured-h" className="h2">
              Start here.
            </h2>
          </header>
        </div>
        <div className="container">
          <div className="cell-row">
            {featured.map((article) => (
              <ArticleCell key={article.slug} article={article} />
            ))}
          </div>
        </div>
      </section>

      {/* ============ TOPICS ============ */}
      <section id="topics" className="section" aria-labelledby="kb-topics-h">
        <div className="container">
          <header className="section__head">
            <span className="eyebrow">02 · Topics</span>
            <h2 id="kb-topics-h" className="h2">
              Guidance by topic.
            </h2>
          </header>
          <div className="kb-cats">
            {groupedArticles.map((group) => (
              <a
                key={group.category.id}
                className="btn btn--outline btn--sm"
                href={`#${group.category.id}`}
              >
                {group.category.label}
              </a>
            ))}
          </div>
        </div>
        <div className="container">
          {groupedArticles.map((group) => (
            <section key={group.category.id} id={group.category.id} className="kb-cat">
              <div className="kb-cat__head">
                <div>
                  <h3>{group.category.label}</h3>
                  <p>{group.category.description}</p>
                </div>
                <span className="kb-cat__count mono">{group.articles.length} guides</span>
              </div>
              <div className="kb-grid kb-grid--3">
                {group.articles.map((article) => (
                  <ArticleCell key={article.slug} article={article} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      {/* ============ FAQ ============ */}
      {faqHighlights.length > 0 ? (
        <section className="section" aria-labelledby="kb-faq-h">
          <div className="container">
            <header className="section__head">
              <span className="eyebrow">03 · FAQ</span>
              <h2 id="kb-faq-h" className="h2">
                Common setup questions.
              </h2>
            </header>
          </div>
          <div className="container">
            <div className="kb-grid kb-faq">
              {faqHighlights.map((item) => (
                <div key={item.question} className="cell">
                  <h4>{item.question}</h4>
                  <p>{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ============ CTA ============ */}
      <section className="cta-section" aria-labelledby="kb-cta-h">
        <div className="cta-section__inner container">
          <span className="eyebrow">Get started</span>
          <h2 id="kb-cta-h" className="display display--cta">
            Run your free UAE setup estimate.
          </h2>
          <Link className="btn btn--accent btn--lg" href="/estimate">
            Start Estimate
          </Link>
          <p className="micro mono">No card. No call. 90 seconds.</p>
        </div>
      </section>
    </>
  );
}

function ArticleCell({ article }: { article: KnowledgeBaseArticle }) {
  const readingTime = `${article.readingTimeMinutes} min read`;

  return (
    <article className="cell cell--svc">
      <div className="kb-meta">
        <span className="eyebrow">{article.category}</span>
        <span className="cell__sub mono">{readingTime}</span>
      </div>
      <h3>
        <Link href={`/knowledge-base/${article.slug}`} className="kb-card__title">
          {article.title}
        </Link>
      </h3>
      <p>{article.description}</p>
      <p className="cell__sub mono kb-card__updated">Updated {article.updatedAt}</p>
    </article>
  );
}
