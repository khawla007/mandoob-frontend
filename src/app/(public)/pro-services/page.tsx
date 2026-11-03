import type { Metadata } from 'next';
import {
  BadgePercent,
  Building2,
  ClipboardList,
  Headset,
  IdCard,
  Landmark,
  RefreshCw,
} from 'lucide-react';

import { PublicConversionBand } from '@/components/site/about-contact/PublicConversionBand';
import { InfoCardGrid, InfoPageHero, InfoSection } from '@/components/site/resources/InfoPage';

export const metadata: Metadata = {
  title: 'PRO Services in the UAE | Mandoob',
  description:
    'PRO support for approvals, documentation, visas, renewals and government processes for your UAE company.',
  alternates: { canonical: '/pro-services' },
};

const SERVICES = [
  {
    icon: <ClipboardList />,
    title: 'Document Clearing',
    text: 'Attestation, submissions and authority follow-up.',
  },
  {
    icon: <Building2 />,
    title: 'Government Liaison',
    text: 'DED, free zone and immigration coordination.',
  },
  {
    icon: <IdCard />,
    title: 'Visa Processing',
    text: 'Investor, employee and family visa applications.',
  },
  {
    icon: <RefreshCw />,
    title: 'Renewals',
    text: 'Licence, establishment card and visa renewal tracking.',
  },
  {
    icon: <Landmark />,
    title: 'Bank Account Support',
    text: 'Application preparation and bank introductions.',
  },
  {
    icon: <BadgePercent />,
    title: 'VAT & Compliance',
    text: 'Registration, filing reminders and document support.',
  },
  {
    icon: <Headset />,
    title: 'Dedicated PRO',
    text: 'A named relationship manager for your company.',
  },
].map((item) => ({ ...item, href: '/contact', cta: 'Request Help' }));

export default function ProServicesPage() {
  return (
    <>
      <InfoPageHero
        headingId="pro-services-title"
        eyebrow="PRO Services"
        title="Expert PRO Support at Every Step"
        description="Let experienced PROs handle approvals, documentation and government processes."
        currentLabel="PRO Services"
        imageSrc="/hero/pro-firm-operations.webp"
        imageAlt="PRO team reviewing company documents"
      />
      <InfoSection
        headingId="pro-services-handle-title"
        eyebrow="What We Handle"
        title="Complete Corporate Services"
      >
        <InfoCardGrid items={SERVICES} />
      </InfoSection>
      <PublicConversionBand
        headingId="pro-services-conversion-title"
        title="Need a PRO for your company?"
        description="Message your assigned PRO from the client dashboard or talk to our team."
        primaryCta={{ label: 'Talk to our team', href: '/contact' }}
        secondaryCta={{ label: 'Calculate My Setup Cost', href: '/estimate' }}
      />
    </>
  );
}
