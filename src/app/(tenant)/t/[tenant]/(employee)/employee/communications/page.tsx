import { OperationalWorkspace } from '@/components/operations/OperationalWorkspace';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';

export default async function EmployeeCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  await authorizeEmployeePortalRead(slug);
  return (
    <OperationalWorkspace
      role="employee"
      module="communications"
      baseHref={`/t/${encodeURIComponent(slug)}/employee/communications`}
      tenantSlug={slug}
      search={await searchParams}
    />
  );
}
