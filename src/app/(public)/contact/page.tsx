import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ContactPageBody } from '@/components/site/contact/ContactPageBody';
import { resolveContactDemoMode } from '@/lib/public-contact/demo-mode';

export const metadata: Metadata = {
  title: 'Contact Mandoob',
  description: 'Find the current ways to continue your UAE company setup journey with Mandoob.',
  alternates: { canonical: 'https://mandoob.ae/contact' },
};

type ContactPageProps = {
  searchParams: Promise<{ demo?: string | string[] }>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const tContact = await getTranslations('contact');
  const tSite = await getTranslations('site');
  const demoMode =
    process.env.NODE_ENV === 'development'
      ? resolveContactDemoMode((await searchParams).demo, process.env.NODE_ENV)
      : undefined;

  return (
    <ContactPageBody
      heroCopy={{
        eyebrow: tContact('eyebrow'),
        title: tContact('title'),
        description: tSite('footer.description'),
        estimateLabel: tSite('getEstimate'),
      }}
      demoOutcome={demoMode?.outcome}
      demoDelayMs={demoMode?.delayMs}
    />
  );
}
