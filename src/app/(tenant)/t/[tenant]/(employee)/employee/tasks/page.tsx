import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';

export default async function EmployeeTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  await authorizeEmployeePortalRead(slug);
  const baseHref = `/t/${encodeURIComponent(slug)}/employee/tasks`;
  return (
    <OperationalUnavailableRoute
      role="employee"
      module="tasks"
      baseHref={baseHref}
      search={await searchParams}
    />
  );
}
