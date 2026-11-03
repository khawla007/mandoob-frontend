import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock3, Headset, RefreshCw, ShieldCheck } from 'lucide-react';

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
                <span className="eyebrow eyebrow--accent">FAQ</span>
                <h2 id="kb-faq-h">Frequently Asked Questions</h2>
                <p>Quick answers to the most common questions.</p>
              </div>
              <Link className="kb-text-link" href="/faq">
                View All FAQs <span aria-hidden="true">→</span>
              </Link>
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
              <h3>Can&apos;t Find What You Need?</h3>
              <p>Our experts are here to help you with any questions you may have.</p>
              <Link className="btn btn--outline" href="/contact">
                Contact Our Experts
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
          {(
            [
              ['Expert Support', 'Get guidance from business setup professionals.', Headset],
              ['Accurate Information', 'Trusted, up-to-date and verified resources.', ShieldCheck],
              ['Save Time', 'Find answers quickly and move forward faster.', Clock3],
              [
                'Always Updated',
                'We regularly update our content with the latest changes.',
                RefreshCw,
              ],
            ] as const
          ).map(([title, description, Icon]) => (
            <div key={title}>
              <span aria-hidden="true">
                <Icon />
              </span>
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
