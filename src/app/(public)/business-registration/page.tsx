import { buildPublicMetadata } from '@/lib/public-metadata';
import { BusinessRegistrationPage } from '@/components/site/business-registration/BusinessRegistrationPage';

export const metadata = buildPublicMetadata({
  title: 'UAE Business Registration | Mandoob',
  description:
    'Compare Mainland, Free Zone and Offshore setup, then follow six guided steps to register your UAE company.',
  canonical: '/business-registration',
});

export default function BusinessRegistrationRoute() {
  return <BusinessRegistrationPage />;
}
