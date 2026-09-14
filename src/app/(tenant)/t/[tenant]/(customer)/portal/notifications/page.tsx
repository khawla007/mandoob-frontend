import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';

export default async function CustomerNotificationsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await authorizeCustomerLinkedCompanyRead(slug);
  return (
    <OperationalUnavailableRoute
      role="customer"
      module="notifications"
      baseHref={`/t/${encodeURIComponent(slug)}/portal/notifications`}
    />
  );
}
