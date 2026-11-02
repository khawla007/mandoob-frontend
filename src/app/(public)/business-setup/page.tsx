import { buildPublicMetadata } from '@/lib/public-metadata';
import { BusinessRegistrationServices } from '@/components/site/business-setup/BusinessRegistrationServices';

export const metadata = buildPublicMetadata({
  title: 'UAE Business Registration Services | Mandoob',
  description:
    'Explore UAE business registration services across Mainland, Free Zone and Offshore — estimate costs, compare setup types, and start registration.',
  canonical: '/business-setup',
});

export default function BusinessSetupPage() {
  return <BusinessRegistrationServices />;
}
