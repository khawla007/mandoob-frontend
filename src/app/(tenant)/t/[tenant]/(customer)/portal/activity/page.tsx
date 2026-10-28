import { OperationalWorkspace } from '@/components/operations/OperationalWorkspace';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';

export default async function CustomerActivityPage({
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
      module="activity"
      baseHref={`/t/${encodeURIComponent(slug)}/portal/activity`}
      tenantSlug={slug}
      search={await searchParams}
    />
  );
}
