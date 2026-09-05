import type { Metadata } from 'next';
import Link from 'next/link';

import { KnowledgeBaseExplorer } from '@/components/knowledge-base/KnowledgeBaseExplorer';
import { KnowledgeBaseNewsletter } from '@/components/knowledge-base/KnowledgeBaseNewsletter';
import { KNOWLEDGE_BASE_CATEGORIES, knowledgeBaseArticles } from '@/lib/knowledge-base';

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: 'UAE Company Setup Knowledge Base | Mandoob',
  description:
    'Browse practical UAE company setup guidance for jurisdictions, documents, indicative timelines, visas, costs, and compliance.',
  alternates: { canonical: '/knowledge-base' },
};

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = firstValue(params.q);
  const category = firstValue(params.category);
  const faqHighlights = knowledgeBaseArticles.flatMap((article) => article.faq).slice(0, 6);

  return (
    <>
      {/* KB-REGION-1: hero, search, and suggested searches */}
      <KnowledgeBaseExplorer
        articles={knowledgeBaseArticles}
        categories={KNOWLEDGE_BASE_CATEGORIES}
        query={query}
        category={category}
      />

      {/* KB-REGION-2: browse by category is rendered by KnowledgeBaseExplorer */}
      {/* KB-REGION-3: Start here guides are rendered by KnowledgeBaseExplorer */}

      {/* KB-REGION-4: FAQ and support rail */}
      <section id="faqs" className="kb-reference-section kb-faq-support" aria-labelledby="kb-faq-h">
        <div className="kb-faq-support__grid container">
          <div>
            <header className="kb-section-row">
              <div>
                <h2 id="kb-faq-h">Frequently asked questions</h2>
                <p>Quick answers drawn from the reviewed Knowledge Base catalog.</p>
              </div>
              <a className="kb-text-link" href="#faqs">
                All FAQs in this section
              </a>
            </header>
            <div className="kb-faq-list">
              {faqHighlights.map((item, index) => (
                <details key={item.question} open={index === 0}>
                  <summary>{item.question}</summary>
                  <div>
                    <p>{item.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
          <aside
            className="kb-support-rail"
            aria-label="Knowledge Base support options"
            role="region"
          >
            <div className="kb-support-card">
              <span className="eyebrow">Need another route?</span>
              <h3>Contact Mandoob</h3>
              <p>Use the accepted no-write contact experience to review your question.</p>
              <Link className="btn btn--outline" href="/contact">
                Open contact options
              </Link>
            </div>
            <div className="kb-support-card kb-support-card--unavailable">
              <span className="eyebrow">WhatsApp · Unavailable</span>
              <h3>Messaging is not enabled</h3>
              <p>
                No verified WhatsApp destination or delivery contract is available in this phase.
              </p>
              <span className="kb-unavailable-label">Unavailable</span>
            </div>
          </aside>
        </div>
      </section>

      {/* KB-REGION-5: newsletter no-write demonstration */}
      <section
        className="kb-reference-section kb-newsletter-section"
        aria-labelledby="kb-newsletter-h"
      >
        <div className="container">
          <KnowledgeBaseNewsletter />
        </div>
      </section>

      {/* KB-REGION-6: trust and information strip */}
      <section className="kb-information-strip" aria-label="Knowledge Base information qualities">
        <div className="kb-information-strip__grid container">
          {[
            ['Structured guidance', 'Topics follow the reviewed static catalog.'],
            ['Source-qualified', 'Variable rules remain subject to the current authority.'],
            ['Fast navigation', 'Search, filters, and direct guide links stay shareable.'],
            [
              'Visible context',
              'Dates and reading time appear only when the catalog supplies them.',
            ],
          ].map(([title, description], index) => (
            <div key={title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* KB-REGION-7: accepted shared footer follows from the public layout */}
    </>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
