import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';

export default async function CustomerTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  await authorizeCustomerLinkedCompanyRead(slug);
  const baseHref = `/t/${encodeURIComponent(slug)}/portal/tasks`;
  return (
    <OperationalUnavailableRoute
      role="customer"
      module="tasks"
      baseHref={baseHref}
      search={await searchParams}
    />
  );
}
