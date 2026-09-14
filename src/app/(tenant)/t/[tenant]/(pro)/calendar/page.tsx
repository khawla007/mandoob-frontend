import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';

export default async function ProCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  await requireProTenantRouteAccess(slug);
  const baseHref = `/t/${encodeURIComponent(slug)}/calendar`;
  return (
    <OperationalUnavailableRoute
      role="pro"
      module="calendar"
      baseHref={baseHref}
      search={await searchParams}
    />
  );
}
