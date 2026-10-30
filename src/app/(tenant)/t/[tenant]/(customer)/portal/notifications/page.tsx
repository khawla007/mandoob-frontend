import { OperationalWorkspace } from '@/components/operations/OperationalWorkspace';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';

export default async function CustomerNotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  await authorizeCustomerLinkedCompanyRead(slug);
  return (
    <OperationalWorkspace
      role="customer"
      module="notifications"
      baseHref={`/t/${encodeURIComponent(slug)}/portal/notifications`}
      tenantSlug={slug}
      search={await searchParams}
    />
  );
}
