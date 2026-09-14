import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';

export default async function CustomerCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  await authorizeCustomerLinkedCompanyRead(slug);
  const baseHref = `/t/${encodeURIComponent(slug)}/portal/calendar`;
  return (
    <OperationalUnavailableRoute
      role="customer"
      module="calendar"
      baseHref={baseHref}
      search={await searchParams}
    />
  );
}
