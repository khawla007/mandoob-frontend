import type { Metadata } from 'next';
import { FreeZoneDirectoryPage } from '@/components/site/company-setup/FreeZoneDirectoryPage';

export const metadata: Metadata = {
  title: 'UAE Free Zone Directory | Mandoob',
  description: 'Search, filter and compare UAE free zones in one place.',
  alternates: { canonical: '/free-zones/directory' },
};

export default function FreeZoneDirectoryRoute() {
  return <FreeZoneDirectoryPage />;
}
