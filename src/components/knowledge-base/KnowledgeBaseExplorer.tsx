import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CircleDollarSign,
  Clock3,
  FileText,
  Globe2,
  IdCard,
  ShieldCheck,
} from 'lucide-react';

import {
  buildKnowledgeBaseIndex,
  filterKnowledgeBaseArticles,
  normalizeKnowledgeQuery,
} from '@/lib/knowledge-base/discovery';
import type {
  KnowledgeBaseArticle,
  KnowledgeBaseCategory,
  KnowledgeBaseCategoryId,
} from '@/lib/knowledge-base';

import { KnowledgeBaseCategoryGrid } from './KnowledgeBaseCategoryGrid';

const POPULAR_QUERIES = ['Free zones', 'Documents', 'Visas', 'Costs'] as const;
const CATEGORY_IMAGES: Record<string, string> = {
  'company-setup': '/home-reference/business-setup-hd.png',
  jurisdictions: '/company-setup/mainland-hero.webp',
  documents: '/home-reference/uae-document-checklist.webp',
  timelines: '/company-setup/emirates/dubai.jpg',
  visas: '/home-reference/pro-services-hd.png',
  costs: '/home-reference/vat-registration-hd.png',
  compliance: '/company-setup/free-zone-hero.webp',
};
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'company-setup': Building2,
  jurisdictions: Globe2,
  documents: FileText,
  timelines: Clock3,
  visas: IdCard,
  costs: CircleDollarSign,
  compliance: ShieldCheck,
};
const GUIDE_IMAGES = [
  '/company-setup/mainland-hero.webp',
  '/company-setup/free-zone-hero.webp',
  '/company-setup/offshore-hero.webp',
  '/home-reference/business-setup-hd.png',
] as const;

type Props = {
  articles: readonly KnowledgeBaseArticle[];
  categories: readonly KnowledgeBaseCategory[];
  query?: string;
  category?: string;
};

export function KnowledgeBaseExplorer({ articles, categories, query = '', category }: Props) {
  const normalizedQuery = normalizeKnowledgeQuery(query);
  const activeCategory = categories.some((item) => item.id === category)
    ? (category as KnowledgeBaseCategoryId)
    : undefined;
  const index = buildKnowledgeBaseIndex(articles, categories);
  const allCategories = [...index.primaryCategories, ...index.additionalCategories];
  const results = filterKnowledgeBaseArticles(articles, categories, {
    query: normalizedQuery,
    category: activeCategory,
  });

  return (
    <>
      <section className="kb-reference-hero" aria-labelledby="kb-h">
        <div className="kb-reference-hero__inner container">
          <div className="kb-reference-hero__copy">
            <nav className="about-contact-breadcrumb" aria-label="Breadcrumb">
              <ol>
                <li>
                  <Link href="/">Home</Link>
                </li>
                <li aria-current="page">Knowledge Base</li>
              </ol>
            </nav>
            <span className="eyebrow eyebrow--accent">Knowledge Base</span>
            <h1 id="kb-h" className="kb-reference-hero__title">
              Find Answers. Start Your Business with Confidence.
            </h1>
            <p className="lede">
              Explore guides, FAQs, and resources to help you understand the UAE business setup
              process better.
            </p>
            <form className="kb-search" action="/knowledge-base" role="search">
              <label htmlFor="knowledge-query">Search the Knowledge Base</label>
              <div className="kb-search__control">
                <input
                  id="knowledge-query"
                  name="q"
                  type="search"
                  defaultValue={normalizedQuery}
                  placeholder="Search guides and answers"
                  aria-describedby="knowledge-search-help knowledge-search-status"
                />
                {activeCategory ? (
                  <input type="hidden" name="category" value={activeCategory} />
                ) : null}
                <button className="btn btn--accent" type="submit">
                  Search
                </button>
              </div>
              <p id="knowledge-search-help" className="micro">
                Search titles, summaries, topics, and reviewed keywords.
              </p>
            </form>
            <div className="kb-popular" aria-label="Suggested searches">
              <span>Suggested searches</span>
              <div>
                {POPULAR_QUERIES.map((item) => (
                  <Link
                    key={item}
                    className={
                      normalizedQuery === normalizeKnowledgeQuery(item)
                        ? 'kb-chip kb-chip--active'
                        : 'kb-chip'
                    }
                    href={knowledgeHref({ query: item, category: activeCategory })}
                    aria-current={
                      normalizedQuery === normalizeKnowledgeQuery(item) ? 'true' : undefined
                    }
                  >
                    {item}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <Image
            className="kb-reference-hero__image"
            src="/hero/knowledge-base-research.webp"
            alt="Dubai skyline beside a workspace used for company setup research"
            width={720}
            height={560}
            priority
          />
        </div>
      </section>

      <section id="topics" className="kb-reference-section" aria-labelledby="kb-topics-h">
        <div className="container">
          <header className="kb-reference-heading">
            <span className="eyebrow eyebrow--accent">Browse by category</span>
            <h2 id="kb-topics-h">Browse by Category</h2>
            <p>Explore topics that help you every step of the way.</p>
          </header>
          <KnowledgeBaseCategoryGrid
            initial={allCategories.slice(0, 4).map((item) => (
              <CategoryCard
                key={item.id}
                category={item}
                count={index.categoryCounts.get(item.id) ?? 0}
                active={activeCategory === item.id}
                query={normalizedQuery}
              />
            ))}
            extra={allCategories.slice(4).map((item) => (
              <CategoryCard
                key={item.id}
                category={item}
                count={index.categoryCounts.get(item.id) ?? 0}
                active={activeCategory === item.id}
                query={normalizedQuery}
              />
            ))}
          />
        </div>
      </section>

      <section id="guides" className="kb-reference-section kb-guides" aria-labelledby="kb-guides-h">
        <div className="container">
          <div className="kb-section-row">
            <header>
              <h2 id="kb-guides-h">Popular Guides</h2>
              <p>Expert-written guides to help you make informed decisions.</p>
            </header>
            {normalizedQuery || activeCategory ? (
              <Link className="kb-text-link" href="/knowledge-base">
                Reset search and filters
              </Link>
            ) : (
              <Link className="kb-text-link" href="/guides">
                View All Guides <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
          <p id="knowledge-search-status" className="sr-only" aria-live="polite">
            {results.length} {results.length === 1 ? 'guide' : 'guides'} found.
          </p>
          {results.length > 0 ? (
            <div className="kb-guide-grid">
              {(normalizedQuery || activeCategory ? results : index.featured).map((article, i) => (
                <GuideCard key={article.slug} article={article} image={GUIDE_IMAGES[i % 4]} />
              ))}
            </div>
          ) : (
            <div className="kb-no-results" role="status">
              <span className="eyebrow">No matching guides</span>
              <h3>Try a broader setup topic.</h3>
              <p>
                No reviewed guide matches “{normalizedQuery || activeCategory}”. Clear the current
                search and category to browse every guide.
              </p>
              <Link className="btn btn--outline" href="/knowledge-base">
                Clear search and filters
              </Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function CategoryCard({
  category,
  count,
  active,
  query,
}: {
  category: KnowledgeBaseCategory;
  count: number;
  active: boolean;
  query: string;
}) {
  const Icon = CATEGORY_ICONS[category.id] ?? FileText;
  const href = knowledgeHref({ query, category: active ? undefined : category.id });
  return (
    <article
      className={active ? 'home-knowledge-card kb-category-card--active' : 'home-knowledge-card'}
    >
      <div className="home-knowledge-card__media">
        <Image
          src={CATEGORY_IMAGES[category.id] ?? CATEGORY_IMAGES['company-setup']}
          alt=""
          fill
          sizes="(max-width: 767px) 100vw, (max-width: 1100px) 50vw, 25vw"
        />
        <span>
          <Icon aria-hidden="true" />
          {count} {count === 1 ? 'Article' : 'Articles'}
        </span>
      </div>
      <div className="home-knowledge-card__body">
        <h3>{category.label}</h3>
        <p>{category.description}</p>
        <Link className="home-text-link" href={href} aria-current={active ? 'true' : undefined}>
          {active ? 'Clear Filter' : 'View Articles'} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

function GuideCard({ article, image }: { article: KnowledgeBaseArticle; image: string }) {
  return (
    <article className="kb-guide-card">
      <Link href={`/knowledge-base/${article.slug}`} className="kb-guide-card__media" tabIndex={-1}>
        <Image
          src={image}
          alt={`Illustration for ${article.title}`}
          fill
          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
        />
      </Link>
      <div className="kb-guide-card__body">
        <span className="eyebrow">{article.category.replaceAll('-', ' ')}</span>
        <h3>
          <Link href={`/knowledge-base/${article.slug}`}>{article.title}</Link>
        </h3>
        <p>{article.description}</p>
        <span className="micro">{article.readingTimeMinutes} min read</span>
      </div>
    </article>
  );
}

function knowledgeHref({ query, category }: { query?: string; category?: string }) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('category', category);
  const value = params.toString();
  return value ? `/knowledge-base?${value}` : '/knowledge-base';
}
