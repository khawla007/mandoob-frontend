import type { Metadata } from 'next';
import { OffshoreDiscovery } from '@/components/site/company-setup/OffshoreDiscovery';

export const metadata: Metadata = {
  title: 'UAE Offshore Company Setup Guide | Mandoob',
  description:
    'Compare available UAE Offshore setup records, requirements, and indicative planning factors.',
  alternates: { canonical: '/offshore' },
  openGraph: {
    title: 'UAE Offshore Company Setup Guide | Mandoob',
    description:
      'Compare available UAE Offshore setup records, requirements, and indicative planning factors.',
    url: '/offshore',
    type: 'website',
  },
};

export default function OffshorePage() {
  return <OffshoreDiscovery />;
}
