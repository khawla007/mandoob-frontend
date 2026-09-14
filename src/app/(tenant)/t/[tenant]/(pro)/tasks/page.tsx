import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';

export default async function ProTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  await requireProTenantRouteAccess(slug);
  const baseHref = `/t/${encodeURIComponent(slug)}/tasks`;
  return (
    <OperationalUnavailableRoute
      role="pro"
      module="tasks"
      baseHref={baseHref}
      search={await searchParams}
    />
  );
}
