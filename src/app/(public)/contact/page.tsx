import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ContactPageBody } from '@/components/site/contact/ContactPageBody';
import { resolveContactDemoMode } from '@/lib/public-contact/demo-mode';
import { resolveContactTopic } from '@/lib/public-contact/contact-topic';

export const metadata: Metadata = {
  title: 'Contact Mandoob',
  description: 'Find the current ways to continue your UAE company setup journey with Mandoob.',
  alternates: { canonical: 'https://mandoob.ae/contact' },
};

type ContactPageProps = {
  searchParams: Promise<{ demo?: string | string[]; topic?: string | string[] }>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const tContact = await getTranslations('contact');
  const tSite = await getTranslations('site');
  const query = await searchParams;
  const demoMode =
    process.env.NODE_ENV === 'development'
      ? resolveContactDemoMode(query.demo, process.env.NODE_ENV)
      : undefined;
  const topic = resolveContactTopic(query.topic);

  return (
    <ContactPageBody
      heroCopy={{
        eyebrow: tContact('eyebrow'),
        title: tContact('title'),
        description: tSite('footer.description'),
      }}
      demoOutcome={demoMode?.outcome}
      demoDelayMs={demoMode?.delayMs}
      proInterest={topic === 'pro-interest'}
    />
  );
}
