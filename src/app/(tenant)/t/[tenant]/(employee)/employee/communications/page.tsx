import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';

export default async function EmployeeCommunicationsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await authorizeEmployeePortalRead(slug);
  return (
    <OperationalUnavailableRoute
      role="employee"
      module="communications"
      baseHref={`/t/${encodeURIComponent(slug)}/employee/communications`}
    />
  );
}
