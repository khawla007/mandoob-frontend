import type { Metadata } from 'next';
import { MainlandDiscovery } from '@/components/site/company-setup/MainlandDiscovery';

export const metadata: Metadata = {
  title: 'UAE Mainland Company Setup Guide | Mandoob',
  description:
    'Compare UAE Mainland setup paths, activities, documents, and indicative cost factors.',
  alternates: { canonical: '/mainland' },
  openGraph: {
    title: 'UAE Mainland Company Setup Guide | Mandoob',
    description:
      'Compare UAE Mainland setup paths, activities, documents, and indicative cost factors.',
    url: '/mainland',
    type: 'website',
  },
};

export default function MainlandPage() {
  return <MainlandDiscovery />;
}
