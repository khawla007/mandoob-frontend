import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ContactPageBody } from '@/components/site/contact/ContactPageBody';

export const metadata: Metadata = {
  title: 'Contact Mandoob',
  description: 'Find the current ways to continue your UAE company setup journey with Mandoob.',
  alternates: { canonical: 'https://mandoob.ae/contact' },
};

export default async function ContactPage() {
  const tContact = await getTranslations('contact');
  const tSite = await getTranslations('site');

  return (
    <ContactPageBody
      heroCopy={{
        eyebrow: tContact('eyebrow'),
        title: tContact('title'),
        description: tSite('footer.description'),
        estimateLabel: tSite('getEstimate'),
      }}
    />
  );
}
