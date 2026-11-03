import type { Metadata } from 'next';
import { BookOpen, Calculator, ClipboardList, Route } from 'lucide-react';

import { InfoCardGrid, InfoPageHero, InfoSection } from '@/components/site/resources/InfoPage';
import { knowledgeBaseArticles } from '@/lib/knowledge-base';

export const metadata: Metadata = {
  title: 'UAE Business Setup Guides | Mandoob',
  description: 'Step-by-step guides covering every stage of UAE company setup.',
  alternates: { canonical: '/guides' },
};

const CHECKLISTS = [
  {
    icon: <Calculator />,
    title: 'Cost Estimator',
    text: 'Get an itemised quote.',
    href: '/estimate',
    cta: 'Calculate',
  },
  {
    icon: <ClipboardList />,
    title: 'Documents',
    text: 'Review required documents.',
    href: '/document-requirements',
    cta: 'View Checklist',
  },
  {
    icon: <Route />,
    title: 'Process',
    text: 'Follow the complete registration journey.',
    href: '/business-registration',
    cta: 'View Process',
  },
];

export default function GuidesPage() {
  const guides = knowledgeBaseArticles.map((article) => ({
    icon: <BookOpen />,
    title: article.title,
    text: article.description,
    href: `/knowledge-base/${article.slug}`,
    cta: `${article.readingTimeMinutes} min read`,
  }));

  return (
    <>
      <InfoPageHero
        headingId="guides-title"
        eyebrow="Business Setup Guides"
        title="Step-by-Step Guides"
        description="Guides covering every stage of UAE setup."
        currentLabel="Guides"
        imageSrc="/hero/knowledge-base-research.webp"
        imageAlt="Researching UAE business setup guidance"
      />
      <InfoSection headingId="guides-list-title" eyebrow="Guides" title="All Guides">
        <InfoCardGrid items={guides} />
      </InfoSection>
      <InfoSection
        headingId="guides-checklist-title"
        eyebrow="Need a Checklist?"
        title="Start With the Essentials"
        tone="soft"
      >
        <InfoCardGrid items={CHECKLISTS} />
      </InfoSection>
    </>
  );
}
