import type { Metadata } from 'next';
import { FreeZonesDiscovery } from '@/components/site/company-setup/FreeZonesDiscovery';

export const metadata: Metadata = {
  title: 'UAE Free Zone Company Setup Guide | Mandoob',
  description:
    'Explore UAE Free Zones with a deterministic comparison directory and indicative planning guidance.',
  alternates: { canonical: '/free-zones' },
  openGraph: {
    title: 'UAE Free Zone Company Setup Guide | Mandoob',
    description:
      'Explore UAE Free Zones with a deterministic comparison directory and indicative planning guidance.',
    url: '/free-zones',
    type: 'website',
  },
};

export default function FreeZonesPage() {
  return <FreeZonesDiscovery />;
}
