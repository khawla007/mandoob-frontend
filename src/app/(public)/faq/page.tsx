import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { EntranceReveal } from '@/components/site/EntranceReveal';
import { FaqAccordion } from '@/components/site/home/FaqAccordion';
import { InfoPageHero, InfoSection } from '@/components/site/resources/InfoPage';
import { knowledgeBaseArticles } from '@/lib/knowledge-base';

export const metadata: Metadata = {
  title: 'UAE Business Setup FAQ | Mandoob',
  description: 'Quick answers about jurisdiction, costs, documents, visas and setup.',
  alternates: { canonical: '/faq' },
};

const RESOURCES = [
  { label: 'Knowledge Base', href: '/knowledge-base' },
  { label: 'Document Requirements', href: '/document-requirements' },
  { label: 'Cost Estimator', href: '/estimate' },
  { label: 'Business Registration', href: '/business-registration' },
] as const;

export default async function FaqPage() {
  const faq = await getTranslations('home.faq');
  const homeItems = [1, 2, 3, 4, 5, 6].map((item) => ({
    question: faq(`q${item}`),
    answer: faq(`a${item}`),
  }));
  const seen = new Set(homeItems.map((item) => item.question));
  const items = [
    ...homeItems,
    ...knowledgeBaseArticles
      .flatMap((article) => article.faq)
      .filter((item) => !seen.has(item.question) && seen.add(item.question)),
  ];

  return (
    <>
      <EntranceReveal />
      <InfoPageHero
        headingId="faq-title"
        eyebrow="FAQ"
        title="Frequently Asked Questions"
        description="Quick answers about jurisdiction, costs, documents, visas and setup."
        currentLabel="FAQ"
        imageSrc="/hero/skyline.webp"
        imageAlt="Dubai skyline"
      />
      <InfoSection headingId="faq-list-title" eyebrow="All Questions" title="Common Questions">
        <div className="info-page__faq-layout">
          <div className="home-faq">
            <FaqAccordion items={items} />
          </div>
          <aside className="info-page__aside" aria-labelledby="faq-help-title">
            <h3 id="faq-help-title">Need more help?</h3>
            <p>Our experts can answer questions specific to your business.</p>
            <Link className="btn btn--accent" href="/contact">
              Contact Experts
            </Link>
            <h3>Useful Resources</h3>
            <ul role="list">
              {RESOURCES.map((resource) => (
                <li key={resource.href}>
                  <Link className="home-text-link" href={resource.href}>
                    {resource.label} <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </InfoSection>
    </>
  );
}
