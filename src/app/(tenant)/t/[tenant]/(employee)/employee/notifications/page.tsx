import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';

export default async function EmployeeNotificationsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await authorizeEmployeePortalRead(slug);
  return (
    <OperationalUnavailableRoute
      role="employee"
      module="notifications"
      baseHref={`/t/${encodeURIComponent(slug)}/employee/notifications`}
    />
  );
}
