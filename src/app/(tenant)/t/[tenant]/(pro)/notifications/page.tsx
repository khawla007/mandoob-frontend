import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';

export default async function ProNotificationsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await requireProTenantRouteAccess(slug);
  return (
    <OperationalUnavailableRoute
      role="pro"
      module="notifications"
      baseHref={`/t/${encodeURIComponent(slug)}/notifications`}
    />
  );
}
