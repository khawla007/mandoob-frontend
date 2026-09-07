import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';

export default async function EmployeeActivityPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await authorizeEmployeePortalRead(slug);
  return (
    <OperationalUnavailableRoute
      role="employee"
      module="activity"
      baseHref={`/t/${encodeURIComponent(slug)}/employee/activity`}
    />
  );
}
